export function getMemberRoleBadge(member, roles = []) {
  if (!member || !Array.isArray(member.roles) || !Array.isArray(roles)) return null;
  const memberRoles = new Set(member.roles.map(String));
  for (const role of roles) {
    if (role?.id && memberRoles.has(String(role.id))) return role;
  }
  return null;
}
