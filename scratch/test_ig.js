const url = 'https://www.instagram.com/p/Da-My7Ckn9R/';

async function main() {
  const res = await fetch(url, {
    headers: { 
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  const html = await res.text();
  console.log('HTML len:', html.length);
  const scontent = [...html.matchAll(/https:\/\/scontent[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  console.log('scontent matches:', scontent.length);
  const cdn = [...html.matchAll(/https:\/\/[a-z0-9-]+\.cdninstagram\.com\/v\/[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  console.log('cdn matches:', cdn.length);
  const ogImg = [...html.matchAll(/property="og:image"\s+content="([^"]+)"/g)];
  console.log('og:image matches:', ogImg.map(m => m[1]));

  const allCdnUrls = [...new Set([...scontent, ...cdn].map(m => m[0]))];
  console.log('All unique CDN urls count:', allCdnUrls.length);
  const filtered = allCdnUrls.filter(u => u.includes('/v/t51.') || u.includes('/v/t50.') || u.includes('/v/t39.'));
  console.log('Filtered t51 count:', filtered.length);
  filtered.forEach((u, i) => console.log(`[${i}]`, u.substring(0, 100)));
}

main();
