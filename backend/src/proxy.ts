import { BlockList, isIP } from 'node:net';
// Trust the immediate peer only when its address is explicitly approved.
export function proxyTrust(
  addresses: readonly string[]
): false | ((address: string, hop: number) => boolean) {
  if (!addresses.length) return false;
  const allowed = new BlockList();
  for (const value of addresses) {
    const [address, bits, ...extra] = value.split('/');
    const version = isIP(address ?? '');
    if (!version || extra.length) throw new Error('TRUSTED_PROXIES exige IPs ou CIDRs explícitos');
    const family = version === 4 ? 'ipv4' : 'ipv6';
    if (bits === undefined) allowed.addAddress(address!, family);
    else {
      const prefix = Number(bits);
      if (!/^\d+$/.test(bits) || prefix < 1 || prefix > (version === 4 ? 32 : 128))
        throw new Error('CIDR de proxy inválido');
      allowed.addSubnet(address!, prefix, family);
    }
  }
  return (address, hop) =>
    hop === 0 && allowed.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}
