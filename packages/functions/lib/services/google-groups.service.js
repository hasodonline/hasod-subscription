"use strict";
/**
 * Google Groups Service Layer
 * Handles all Google Workspace Group management operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.addUserToGroup = addUserToGroup;
exports.removeUserFromGroup = removeUserFromGroup;
exports.isUserInGroup = isUserInGroup;
exports.listGroupMembers = listGroupMembers;
const googleapis_1 = require("googleapis");
const errors_1 = require("../utils/errors");
/**
 * Creates an authorized Google Admin SDK client
 */
function getAdminClient(config, groupEmail) {
    if (!config.serviceAccountKey) {
        throw new errors_1.GoogleGroupsError('Google service account key not configured');
    }
    // Handle both string and object formats
    const credentials = typeof config.serviceAccountKey === 'string'
        ? JSON.parse(config.serviceAccountKey)
        : config.serviceAccountKey;
    // Create JWT client with domain-wide delegation
    const auth = new googleapis_1.google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
        subject: config.adminEmail // Impersonate admin user
    });
    return googleapis_1.google.admin({ version: 'directory_v1', auth });
}
/**
 * Adds a user to a Google Group
 */
async function addUserToGroup(userEmail, groupEmail, config) {
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
    }
    catch (error) {
        // User already in group - treat as success
        if (error.code === 409) {
            console.log(`✓ User ${userEmail} already in group ${groupEmail}`);
            return { success: true, message: 'User already in group' };
        }
        // Group not found
        if (error.code === 404) {
            const msg = `Group ${groupEmail} not found`;
            console.error(`❌ ${msg}`);
            throw new errors_1.GoogleGroupsError(msg, error);
        }
        // Permission denied
        if (error.code === 403) {
            const msg = 'Permission denied. Check Domain-wide delegation setup';
            console.error(`❌ ${msg}`);
            throw new errors_1.GoogleGroupsError(msg, error);
        }
        throw new errors_1.GoogleGroupsError(error.message, error);
    }
}
/**
 * Removes a user from a Google Group
 */
async function removeUserFromGroup(userEmail, groupEmail, config) {
    try {
        console.log(`Removing ${userEmail} from group ${groupEmail}`);
        const adminClient = getAdminClient(config, groupEmail);
        await adminClient.members.delete({
            groupKey: groupEmail,
            memberKey: userEmail
        });
        console.log(`✅ Successfully removed ${userEmail} from ${groupEmail}`);
        return { success: true, message: 'User removed from group' };
    }
    catch (error) {
        // User not in group - treat as success
        if (error.code === 404) {
            console.log(`✓ User ${userEmail} not in group ${groupEmail}`);
            return { success: true, message: 'User not in group' };
        }
        // Permission denied
        if (error.code === 403) {
            const msg = 'Permission denied. Check Domain-wide delegation setup';
            console.error(`❌ ${msg}`);
            throw new errors_1.GoogleGroupsError(msg, error);
        }
        throw new errors_1.GoogleGroupsError(error.message, error);
    }
}
/**
 * Checks if a user is a member of a Google Group
 */
async function isUserInGroup(userEmail, groupEmail, config) {
    try {
        const adminClient = getAdminClient(config, groupEmail);
        await adminClient.members.get({
            groupKey: groupEmail,
            memberKey: userEmail
        });
        return true;
    }
    catch (error) {
        if (error.code === 404) {
            return false;
        }
        throw new errors_1.GoogleGroupsError(error.message, error);
    }
}
/**
 * Lists all members of a Google Group
 */
async function listGroupMembers(groupEmail, config) {
    try {
        const adminClient = getAdminClient(config, groupEmail);
        const response = await adminClient.members.list({
            groupKey: groupEmail
        });
        const members = response.data.members || [];
        return members.map(member => member.email || '').filter(email => email);
    }
    catch (error) {
        throw new errors_1.GoogleGroupsError('Failed to list group members', error);
    }
}
