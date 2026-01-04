/**
 * Google Groups Service Layer
 * Handles all Google Workspace Group management operations
 */

import { google } from 'googleapis';
import { GoogleConfig } from '../utils/config';
import { GoogleGroupsError } from '../utils/errors';

/**
 * Creates an authorized Google Admin SDK client
 */
function getAdminClient(config: GoogleConfig, groupEmail: string) {
  if (!config.serviceAccountKey) {
    throw new GoogleGroupsError('Google service account key not configured');
  }

  // Handle both string and object formats
  const credentials = typeof config.serviceAccountKey === 'string'
    ? JSON.parse(config.serviceAccountKey)
    : config.serviceAccountKey;

  // Create JWT client with domain-wide delegation
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
    subject: config.adminEmail // Impersonate admin user
  });

  return google.admin({ version: 'directory_v1', auth });
}

/**
 * Adds a user to a Google Group
 */
export async function addUserToGroup(
  userEmail: string,
  groupEmail: string,
  config: GoogleConfig
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`Adding ${userEmail} to group ${groupEmail}`);

    const adminClient = getAdminClient(config, groupEmail);

    await adminClient.members.insert({
      groupKey: groupEmail,
      requestBody: {
        email: userEmail,
        role: 'MEMBER'
      }
    });

    console.log(`✅ Successfully added ${userEmail} to ${groupEmail}`);
    return { success: true, message: 'User added to group' };

  } catch (error: any) {
    // User already in group - treat as success
    if (error.code === 409) {
      console.log(`✓ User ${userEmail} already in group ${groupEmail}`);
      return { success: true, message: 'User already in group' };
    }

    // Group not found
    if (error.code === 404) {
      const msg = `Group ${groupEmail} not found`;
      console.error(`❌ ${msg}`);
      throw new GoogleGroupsError(msg, error);
    }

    // Permission denied
    if (error.code === 403) {
      const msg = 'Permission denied. Check Domain-wide delegation setup';
      console.error(`❌ ${msg}`);
      throw new GoogleGroupsError(msg, error);
    }

    throw new GoogleGroupsError(error.message, error);
  }
}

/**
 * Removes a user from a Google Group
 */
export async function removeUserFromGroup(
  userEmail: string,
  groupEmail: string,
  config: GoogleConfig
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`Removing ${userEmail} from group ${groupEmail}`);

    const adminClient = getAdminClient(config, groupEmail);

    await adminClient.members.delete({
      groupKey: groupEmail,
      memberKey: userEmail
    });

    console.log(`✅ Successfully removed ${userEmail} from ${groupEmail}`);
    return { success: true, message: 'User removed from group' };

  } catch (error: any) {
    // User not in group - treat as success
    if (error.code === 404) {
      console.log(`✓ User ${userEmail} not in group ${groupEmail}`);
      return { success: true, message: 'User not in group' };
    }

    // Permission denied
    if (error.code === 403) {
      const msg = 'Permission denied. Check Domain-wide delegation setup';
      console.error(`❌ ${msg}`);
      throw new GoogleGroupsError(msg, error);
    }

    throw new GoogleGroupsError(error.message, error);
  }
}

/**
 * Checks if a user is a member of a Google Group
 */
export async function isUserInGroup(
  userEmail: string,
  groupEmail: string,
  config: GoogleConfig
): Promise<boolean> {
  try {
    const adminClient = getAdminClient(config, groupEmail);

    await adminClient.members.get({
      groupKey: groupEmail,
      memberKey: userEmail
    });

    return true;
  } catch (error: any) {
    if (error.code === 404) {
      return false;
    }
    throw new GoogleGroupsError(error.message, error);
  }
}

/**
 * Lists all members of a Google Group
 */
export async function listGroupMembers(
  groupEmail: string,
  config: GoogleConfig
): Promise<string[]> {
  try {
    const adminClient = getAdminClient(config, groupEmail);

    const response = await adminClient.members.list({
      groupKey: groupEmail
    });

    const members = response.data.members || [];
    return members.map(member => member.email || '').filter(email => email);

  } catch (error: any) {
    throw new GoogleGroupsError('Failed to list group members', error);
  }
}
