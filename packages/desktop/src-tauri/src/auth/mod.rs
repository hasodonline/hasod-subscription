// Authentication and license management module

pub mod keychain;
pub mod oauth;
pub mod license;

// Re-export common types and functions
pub use keychain::{StoredAuth, save_auth_to_keychain, get_auth_from_keychain, clear_auth_from_keychain};
pub use oauth::{
    OAuthStartResult,
    start_google_login,
    wait_for_oauth_callback,
    exchange_oauth_code,
    get_stored_auth,
    refresh_auth_token,
    logout,
};
pub use license::{LicenseStatus, check_license, get_registration_url, save_auth_token};
