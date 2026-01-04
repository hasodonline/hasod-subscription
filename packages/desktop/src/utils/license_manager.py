"""
License Manager for Hasod Downloads
Handles license checking and device UUID management with Hasod Subscription System
Checks if user has active subscription to 'hasod-downloader' (מוריד הסוד) service
"""
import os
import json
import uuid
import requests
from pathlib import Path


class LicenseManager:
    """Manages license validation for the desktop app against Hasod Subscription System"""

    def __init__(self, api_url="https://us-central1-hasod-41a23.cloudfunctions.net/api"):
        """
        Initialize License Manager

        Args:
            api_url: Base URL of the Hasod Subscription API
                     Production: https://us-central1-hasod-41a23.cloudfunctions.net/api
                     Development: http://localhost:5001/hasod-41a23/us-central1/api
        """
        self.api_url = api_url.rstrip('/')
        self.config_dir = Path.home() / '.hasod_downloads'
        self.uuid_file = self.config_dir / 'device_uuid.json'
        self.auth_file = self.config_dir / 'auth_token.json'
        self.device_uuid = self._get_or_create_uuid()
        self.required_service_id = 'hasod-downloader'  # מוריד הסוד service ID

    def _get_or_create_uuid(self):
        """
        Get existing device UUID or create a new one

        Returns:
            str: Device UUID
        """
        # Create config directory if it doesn't exist
        self.config_dir.mkdir(parents=True, exist_ok=True)

        # Check if UUID file exists
        if self.uuid_file.exists():
            try:
                with open(self.uuid_file, 'r') as f:
                    data = json.load(f)
                    return data.get('uuid')
            except Exception as e:
                print(f"Error reading UUID file: {e}")

        # Generate new UUID
        new_uuid = str(uuid.uuid4())

        # Save to file
        try:
            with open(self.uuid_file, 'w') as f:
                json.dump({
                    'uuid': new_uuid,
                    'created_at': str(Path(self.uuid_file).stat().st_ctime if self.uuid_file.exists() else None)
                }, f, indent=2)
        except Exception as e:
            print(f"Error saving UUID file: {e}")

        return new_uuid

    def get_device_uuid(self):
        """
        Get the device UUID

        Returns:
            str: Device UUID
        """
        return self.device_uuid

    def _get_auth_token(self):
        """Get stored authentication token"""
        try:
            if self.auth_file.exists():
                with open(self.auth_file, 'r') as f:
                    data = json.load(f)
                    return data.get('token')
        except Exception as e:
            print(f"Error reading auth token: {e}")
        return None

    def _save_auth_token(self, token):
        """Save authentication token"""
        try:
            self.config_dir.mkdir(parents=True, exist_ok=True)
            with open(self.auth_file, 'w') as f:
                json.dump({
                    'token': token,
                    'device_uuid': self.device_uuid
                }, f, indent=2)
        except Exception as e:
            print(f"Error saving auth token: {e}")

    def check_license(self, user_email=None):
        """
        Check license status with Hasod Subscription API
        Verifies that user has active subscription to 'hasod-downloader' service (מוריד הסוד)

        Args:
            user_email: User email from Google login (required for Has od system)

        Returns:
            dict: License status response
            {
                'is_valid': bool,
                'status': str ('registered', 'not_registered', 'expired', 'suspended', 'error'),
                'uuid': str,
                'email': str (if registered),
                'registration_url': str (if not registered),
                'expires_at': str (if registered),
                'error': str (if error occurred)
            }
        """
        try:
            # Get auth token
            auth_token = self._get_auth_token()

            if not auth_token and not user_email:
                # No token and no email - user needs to authenticate
                return {
                    'is_valid': False,
                    'status': 'not_registered',
                    'uuid': self.device_uuid,
                    'registration_url': self.get_registration_url()
                }

            # Build headers
            headers = {}
            if auth_token:
                headers['Authorization'] = f'Bearer {auth_token}'

            # Check user's subscriptions
            try:
                # Get user subscription info
                response = requests.get(
                    f"{self.api_url}/user/subscription-status",
                    headers=headers,
                    params={'email': user_email} if user_email and not auth_token else {},
                    timeout=10
                )

                if response.status_code == 401:
                    # Unauthorized - token invalid or missing
                    return {
                        'is_valid': False,
                        'status': 'not_registered',
                        'uuid': self.device_uuid,
                        'registration_url': self.get_registration_url(),
                        'error': 'Authentication required'
                    }

                if response.status_code != 200:
                    return {
                        'is_valid': False,
                        'status': 'error',
                        'uuid': self.device_uuid,
                        'error': f"API returned status {response.status_code}: {response.text}"
                    }

                data = response.json()

                # Check if user has hasod-downloader service
                user_email = data.get('email', user_email)
                services = data.get('services', {})

                if self.required_service_id not in services:
                    # User doesn't have the downloader service
                    return {
                        'is_valid': False,
                        'status': 'not_registered',
                        'uuid': self.device_uuid,
                        'email': user_email,
                        'registration_url': self.get_registration_url(),
                        'error': 'No מוריד הסוד subscription found'
                    }

                downloader_service = services[self.required_service_id]
                service_status = downloader_service.get('status')

                if service_status == 'active':
                    # Valid license
                    end_date = downloader_service.get('manualEndDate') or downloader_service.get('nextBillingDate')
                    return {
                        'is_valid': True,
                        'status': 'registered',
                        'uuid': self.device_uuid,
                        'email': user_email,
                        'expires_at': end_date if end_date else 'Active subscription',
                        'service_data': downloader_service
                    }
                elif service_status == 'expired':
                    # Expired subscription
                    return {
                        'is_valid': False,
                        'status': 'expired',
                        'uuid': self.device_uuid,
                        'email': user_email,
                        'registration_url': self.get_registration_url(),
                        'error': 'Subscription expired'
                    }
                elif service_status == 'cancelled':
                    # Cancelled subscription
                    return {
                        'is_valid': False,
                        'status': 'suspended',
                        'uuid': self.device_uuid,
                        'email': user_email,
                        'registration_url': self.get_registration_url(),
                        'error': 'Subscription cancelled'
                    }
                else:
                    # Unknown status
                    return {
                        'is_valid': False,
                        'status': 'error',
                        'uuid': self.device_uuid,
                        'email': user_email,
                        'error': f'Unknown subscription status: {service_status}'
                    }

            except requests.exceptions.RequestException as e:
                print(f"License check request failed: {e}")
                return {
                    'is_valid': False,
                    'status': 'error',
                    'uuid': self.device_uuid,
                    'error': f'Network error: {str(e)}'
                }

        except Exception as e:
            print(f"License check failed: {e}")
            import traceback
            traceback.print_exc()
            return {
                'is_valid': False,
                'status': 'error',
                'uuid': self.device_uuid,
                'error': str(e)
            }

    def set_auth_token(self, token):
        """
        Set authentication token from webapp OAuth flow

        Args:
            token: JWT token from Hasod webapp
        """
        self._save_auth_token(token)

    def get_registration_url(self):
        """
        Get the registration URL for this device
        Points to Hasod subscription webapp

        Returns:
            str: Registration URL with device UUID
        """
        return f"https://hasod-41a23.web.app/subscriptions?device_uuid={self.device_uuid}"

    def is_licensed(self):
        """
        Quick check if the app is licensed

        Returns:
            bool: True if license is valid, False otherwise
        """
        result = self.check_license()
        return result.get('is_valid', False)


# Singleton instance
_license_manager = None


def get_license_manager(api_url="https://us-central1-hasod-41a23.cloudfunctions.net/api"):
    """
    Get or create the license manager singleton

    Args:
        api_url: Base URL of the Hasod Subscription API
                 Production: https://us-central1-hasod-41a23.cloudfunctions.net/api
                 Development: http://localhost:5001/hasod-41a23/us-central1/api

    Returns:
        LicenseManager: License manager instance
    """
    global _license_manager
    if _license_manager is None:
        _license_manager = LicenseManager(api_url)
    return _license_manager
