export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  if (req.method !== 'GET') return res.status(405).json({ status: 'Needs review', message: 'Method not allowed' });
  const name = String(req.query?.name || '').trim();
  const address = String(req.query?.address || '').trim();
  if (!name) return res.status(400).json({ status: 'Needs review', message: 'Business name is required' });
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return res.status(200).json({ status: 'Verification not configured', source: 'Brave Search', message: 'Add BRAVE_SEARCH_API_KEY in Vercel project environment variables.' });
  try {
    const q = '"' + name + '" ' + address + ' official website';
    const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(q) + '&count=8&search_lang=en', {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': key }
    });
    if (!response.ok) return res.status(200).json({ status: 'Verification unavailable', source: 'Brave Search', message: 'Search provider returned ' + response.status });
    const data: any = await response.json();
    const results: any[] = data.web?.results || [];
    const excluded = /(facebook\.com|instagram\.com|linkedin\.com|youtube\.com|justdial\.com|sulekha\.com|zomato\.com|swiggy\.com|tripadvisor\.|magicpin\.in|indiamart\.com|yellowpages\.)/i;
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = results.map((r: any) => {
      let host = '';
      try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch {}
      const title = String(r.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const description = String(r.description || '').toLowerCase();
      const nameMatch = normalized.length > 2 && (title.includes(normalized) || normalized.includes(title));
      const addressTokens = address.toLowerCase().split(/[,\s-]+/).filter((t: string) => t.length > 3);
      const locationMatch = addressTokens.some((t: string) => description.includes(t) || title.includes(t));
      return { url: r.url, host, title: r.title || '', nameMatch, locationMatch, excluded: excluded.test(host) };
    }).filter((r: any) => r.host && !r.excluded && !/\.(pdf|jpg|jpeg|png|webp)$/i.test(r.url));
    candidates.sort((a: any, b: any) => Number(b.nameMatch) - Number(a.nameMatch) || Number(b.locationMatch) - Number(a.locationMatch));
    const best = candidates.find((r: any) => r.nameMatch);
    if (best) return res.status(200).json({ status: 'Website found in web search', website: best.url, source: 'Brave Search', confidence: best.locationMatch ? 'medium' : 'low' });
    return res.status(200).json({ status: results.length ? 'Needs manual review' : 'No website found in search', source: 'Brave Search', message: results.length ? 'Search results were not clearly an official business website.' : 'No search results found. This does not prove the business has no website.' });
  } catch {
    return res.status(200).json({ status: 'Verification unavailable', source: 'Brave Search', message: 'The search request could not be completed.' });
  }
}
