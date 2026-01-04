/**
 * Google Groups Management Implementation
 *
 * This file contains the actual implementation for managing Google Group memberships.
 * Replace the placeholder functions in index.ts with these once you complete the setup.
 *
 * Setup required:
 * 1. Create service account with Domain-wide delegation
 * 2. Enable Admin SDK API
 * 3. Grant OAuth scopes in Google Workspace Admin Console
 * 4. Upload service account key to Firebase
 *
 * See GOOGLE_GROUP_SETUP.md for detailed instructions.
 */

import { google } from 'googleapis';
import { getGoogleConfig } from './utils/config';

const GOOGLE_GROUP_EMAIL = 'hasod-online-member-v1@hasodonline.com';

/**
 * Creates an authorized Google Admin SDK client
 *
 * @returns Authorized admin client
 */
function getAdminClient() {
  // Get service account key from environment variables
  const config = getGoogleConfig();
  const serviceAccountKey = config.serviceAccountKey;
  const adminEmail = config.adminEmail;

  if (!serviceAccountKey) {
    throw new Error('Google service account key not configured');
  }

  // Service account key is already parsed as JSON
  const credentials = serviceAccountKey;

  // Create JWT client with domain-wide delegation
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
    subject: adminEmail // Impersonate this admin user
  });

  return google.admin({ version: 'directory_v1', auth });
}

/**
 * Adds a user to the Google Group
 *
 * @param userEmail - Email address of the user to add
 * @returns Result object with success status and message
 */
export async function addUserToGoogleGroup(
  userEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`Adding user ${userEmail} to Google Group ${GOOGLE_GROUP_EMAIL}`);

    const admin = getAdminClient();

    // Add member to group
    await admin.members.insert({
      groupKey: GOOGLE_GROUP_EMAIL,
      requestBody: {
        email: userEmail,
        role: 'MEMBER' // Can be MEMBER, MANAGER, or OWNER
      }
    });

    console.log(`Successfully added ${userEmail} to ${GOOGLE_GROUP_EMAIL}`);
    return {
      success: true,
      message: `User ${userEmail} added to Google Group`
    };

  } catch (error: any) {
    console.error(`Error adding user to Google Group:`, error);

    // Handle specific errors
    if (error.code === 409) {
      // User already exists in group
      console.log(`User ${userEmail} is already in the group`);
      return {
        success: true,
        message: 'User already in group'
      };
    }

    if (error.code === 404) {
      console.error(`Group ${GOOGLE_GROUP_EMAIL} not found`);
      return {
        success: false,
        message: 'Google Group not found'
      };
    }

    if (error.code === 403) {
      console.error('Permission denied. Check Domain-wide delegation setup.');
      return {
        success: false,
        message: 'Permission denied - check service account setup'
      };
    }

    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Removes a user from the Google Group
 *
 * @param userEmail - Email address of the user to remove
 * @returns Result object with success status and message
 */
export async function removeUserFromGoogleGroup(
  userEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`Removing user ${userEmail} from Google Group ${GOOGLE_GROUP_EMAIL}`);

    const admin = getAdminClient();

    // Remove member from group
    await admin.members.delete({
      groupKey: GOOGLE_GROUP_EMAIL,
      memberKey: userEmail
    });

    console.log(`Successfully removed ${userEmail} from ${GOOGLE_GROUP_EMAIL}`);
    return {
      success: true,
      message: `User ${userEmail} removed from Google Group`
    };

  } catch (error: any) {
    console.error(`Error removing user from Google Group:`, error);

    // Handle specific errors
    if (error.code === 404) {
      console.log(`User ${userEmail} was not in the group or group not found`);
      return {
        success: true,
        message: 'User not in group'
      };
    }

    if (error.code === 403) {
      console.error('Permission denied. Check Domain-wide delegation setup.');
      return {
        success: false,
        message: 'Permission denied - check service account setup'
      };
    }

    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Checks if a user is a member of the Google Group
 *
 * @param userEmail - Email address to check
 * @returns True if user is a member, false otherwise
 */
export async function isUserInGoogleGroup(userEmail: string): Promise<boolean> {
  try {
    const admin = getAdminClient();

    await admin.members.get({
      groupKey: GOOGLE_GROUP_EMAIL,
      memberKey: userEmail
    });

    return true;
  } catch (error: any) {
    if (error.code === 404) {
      return false; // User not in group
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Lists all members of the Google Group
 *
 * @returns Array of member email addresses
 */
export async function listGroupMembers(): Promise<string[]> {
  try {
    const admin = getAdminClient();

    const response = await admin.members.list({
      groupKey: GOOGLE_GROUP_EMAIL
    });

    const members = response.data.members || [];
    return members.map(member => member.email || '').filter(email => email);

  } catch (error: any) {
    console.error('Error listing group members:', error);
    throw error;
  }
}
