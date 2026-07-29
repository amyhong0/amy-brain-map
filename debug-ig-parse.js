const url = 'https://www.instagram.com/p/Da2HgwNEldz/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==';

fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
  }
}).then(async res => {
  console.log('=== HTTP Status ===');
  console.log('Status:', res.status, res.statusText);
  console.log('Content-Type:', res.headers.get('content-type'));

  const html = await res.text();
  console.log('\n=== HTML Info ===');
  console.log('HTML length:', html.length);

  // Check login/challenge
  console.log('Contains loginForm:', html.includes('loginForm') || html.includes('login_form'));
  console.log('Contains challenge:', html.includes('/challenge/') || html.includes('/checkpoint/'));
  console.log('Contains "로그인":', html.includes('로그인'));

  // OG Tags - using simpler regex to avoid PowerShell escaping issues
  console.log('\n=== OG Meta Tags ===');
  
  // Match og:title
  let m = html.match(/property="og:title" content="([^"]*)"/);
  if (!m) m = html.match(/content="([^"]*)" property="og:title"/);
  console.log('OG Title:', m ? m[1] : 'NOT FOUND');

  // Match og:description  
  let d = html.match(/property="og:description" content="([^"]*)"/);
  if (!d) d = html.match(/content="([^"]*)" property="og:description"/);
  console.log('OG Description:', d ? d[1].substring(0, 200) : 'NOT FOUND');

  // Match og:image
  const imgMatches1 = [...html.matchAll(/property="og:image" content="([^"]*)"/g)];
  const imgMatches2 = [...html.matchAll(/content="([^"]*)" property="og:image"/g)];
  const allOgImages = [...imgMatches1.map(x => x[1]), ...imgMatches2.map(x => x[1])];
  console.log('\n=== OG Images ===');
  console.log('OG image count:', allOgImages.length);
  allOgImages.forEach((img, i) => {
    console.log(`  [${i+1}] ${img.substring(0, 120)}`);
  });

  // Check JSON-LD
  console.log('\n=== JSON-LD ===');
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/);
  if (jsonLdMatch) {
    console.log('JSON-LD found, length:', jsonLdMatch[1].length);
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      console.log('JSON-LD keys:', Object.keys(data));
      if (data.image) {
        console.log('JSON-LD images:', JSON.stringify(data.image).substring(0, 300));
      }
    } catch(e) {
      console.log('JSON-LD parse error:', e.message);
      console.log('Raw:', jsonLdMatch[1].substring(0, 500));
    }
  } else {
    console.log('NO JSON-LD found');
  }

  // Check CDN image URLs
  console.log('\n=== CDN Image URLs in HTML ===');
  const cdnImages = [...new Set([
    ...html.matchAll(/https:\/\/[^\s"'<>]+\.jpg[^\s"'<>]*/g),
    ...html.matchAll(/https:\/\/[^\s"'<>]+\.jpeg[^\s"'<>]*/g),
    ...html.matchAll(/https:\/\/[^\s"'<>]+\.png[^\s"'<>]*/g),
    ...html.matchAll(/https:\/\/[^\s"'<>]+\.webp[^\s"'<>]*/g),
  ].map(m => m[0]))];
  console.log('Total CDN image URLs:', cdnImages.length);
  cdnImages.slice(0, 5).forEach((img, i) => {
    console.log(`  [${i+1}] ${img.substring(0, 120)}`);
  });

  // Check for Instagram image CDN patterns
  console.log('\n=== Instagram CDN Pattern ===');
  const igCdnImages = cdnImages.filter(url => 
    url.includes('cdninstagram.com') || 
    url.includes('fbcdn.net') ||
    url.includes('instagram.f')
  );
  console.log('Instagram CDN images:', igCdnImages.length);
  igCdnImages.slice(0, 5).forEach((img, i) => {
    console.log(`  [${i+1}] ${img.substring(0, 120)}`);
  });

  // Check if Instagram blocked / redirected to login
  console.log('\n=== Login Wall Check ===');
  const bodyStart = html.indexOf('<body');
  const bodySnippet = html.substring(bodyStart, bodyStart + 500);
  console.log('Body start:', bodySnippet);

}).catch(e => {
  console.error('Fetch error:', e);
});
