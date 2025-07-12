import fetch from 'node-fetch';

export async function fetchNPMPackageReadme(pkg: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as any;
    return data.readme as string;
  } catch {
    return undefined;
  }
} 