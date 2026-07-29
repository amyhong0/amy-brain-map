// Instagram은 서버사이드에서 og 태그를 제공하는데
// 로그인하지 않은 봇에게는 다른 HTML을 보냄
// 다양한 User-Agent로 테스트

const url = 'https://www.instagram.com/p/Da2HgwNEldz/';

const agents = [
  {
    name: 'Chrome',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  {
    name: 'Googlebot',  
    ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)'
  },
  {
    name: 'facebookexternalhit (Facebook scraper)',
    ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
  },
  {
    name: 'Twitterbot',
    ua: 'Twitterbot/1.0'
  },
  {
    name: 'curl-like simple',
    ua: 'curl/7.79.1'
  }
];

async function testAgent(agentInfo) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': agentInfo.ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    const html = await res.text();
    
    // Check OG tags
    const ogTitle = html.match(/property="og:title" content="([^"]*)"/)?.[1] || 
                    html.match(/content="([^"]*)" property="og:title"/)?.[1] || 'NOT FOUND';
    const ogDesc = html.match(/property="og:description" content="([^"]*)"/)?.[1] ||
                   html.match(/content="([^"]*)" property="og:description"/)?.[1] || 'NOT FOUND';
    const ogImg = html.match(/property="og:image" content="([^"]*)"/)?.[1] ||
                  html.match(/content="([^"]*)" property="og:image"/)?.[1] || 'NOT FOUND';
    
    // Check for _sharedData or __additionalDataLoaded (old Instagram API pattern)
    const hasSharedData = html.includes('window._sharedData');
    const hasAdditionalData = html.includes('window.__additionalDataLoaded');
    const hasRequire = html.includes('window.__bbox');
    
    console.log(`\n[${agentInfo.name}]`);
    console.log(`  Status: ${res.status}, HTML: ${html.length} chars`);
    console.log(`  OG Title: ${ogTitle.substring(0, 80)}`);
    console.log(`  OG Desc: ${ogDesc.substring(0, 80)}`);
    console.log(`  OG Image: ${ogImg.substring(0, 80)}`);
    console.log(`  has _sharedData: ${hasSharedData}`);
    console.log(`  has __additionalDataLoaded: ${hasAdditionalData}`);
    console.log(`  has __bbox: ${hasRequire}`);
    
    // If sharedData found, try to extract
    if (hasSharedData) {
      const sharedMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});\s*<\/script>/);
      if (sharedMatch) {
        console.log('  _sharedData found! Length:', sharedMatch[1].length);
      }
    }
    
  } catch(e) {
    console.log(`[${agentInfo.name}] ERROR:`, e.message);
  }
}

(async () => {
  for (const agent of agents) {
    await testAgent(agent);
  }
  
  console.log('\n\n=== OEMBBED API TEST ===');
  // Instagram oEmbed API (official, no auth required for public posts)
  const oembedUrl = 'https://graph.facebook.com/v18.0/instagram_oembed?url=' + encodeURIComponent(url) + '&access_token=&fields=thumbnail_url,title,author_name,html';
  console.log('oEmbed URL:', oembedUrl);
  try {
    const r = await fetch(oembedUrl);
    console.log('oEmbed status:', r.status);
    const body = await r.text();
    console.log('oEmbed response:', body.substring(0, 500));
  } catch(e) {
    console.log('oEmbed error:', e.message);
  }
})();
