const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function testInstagram() {
  const url = 'https://www.instagram.com/p/Da2HgwNEldz/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==';
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    
    if (!res.ok) {
      console.log('Fetch failed:', res.status, res.statusText);
      return;
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const twitterDesc = $('meta[name="description"]').attr('content') || '';
    
    console.log('OG Title:', ogTitle);
    console.log('OG Description:', ogDesc);
    console.log('Twitter Description:', twitterDesc);
    
    const imageUrls = [];
    const seen = new Set();
    
    $('meta[property="og:image"]').each((_, el) => {
      const src = $(el).attr('content') || '';
      if (src && !seen.has(src)) {
        seen.add(src);
        imageUrls.push(src);
      }
    });
    
    console.log('Image URLs found:', imageUrls.length);
    imageUrls.slice(0, 3).forEach((url, i) => console.log(`Image ${i+1}:`, url));
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testInstagram();