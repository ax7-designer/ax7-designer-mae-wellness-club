export const ADMIN_EMAILS = ['jesuscomtreras.666@gmail.com', 'guemesana12@gmail.com', 'alexis.septem@gmail.com'];

/**
 * Checks if a user is an admin.
 * Uses the database role column as primary authority, falling back to the hardcoded emails array.
 */
export function isAdmin(user) {
    return user && (user.role === 'admin' || ADMIN_EMAILS.includes(user.email));
}
