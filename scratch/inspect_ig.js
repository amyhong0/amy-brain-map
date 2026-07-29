const fs = require('fs');

async function inspectHtml() {
  const url = 'https://www.instagram.com/p/Da-My7Ckn9R/';
  const res = await fetch(url, {
    headers: { 
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  const html = await res.text();
  fs.writeFileSync('scratch/ig_page.html', html);
  console.log('Saved HTML to scratch/ig_page.html (len:', html.length, ')');

  // Check og:image
  const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/);
  console.log('og:image:', ogImg ? ogImg[1] : 'NONE');

  // Search for script tags containing graphQL or json data for this post
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  console.log('Total scripts found:', scripts.length);

  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i][1];
    if (content.includes('carousel_media') || content.includes('edge_sidecar_to_children') || content.includes('display_url')) {
      console.log(`Script ${i} contains carousel / display_url data! Length: ${content.length}`);
    }
  }
}

inspectHtml();
