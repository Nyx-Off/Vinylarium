import { mediaUrl } from '../../lib/storage';

export function publicUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: mediaUrl(u.avatarPath),
    hasPassword: !!u.passwordHash,
    isAdmin: u.isAdmin,
  };
}
