// Googlebot UA로 전체 og 태그 및 이미지 목록 추출
const url = 'https://www.instagram.com/p/Da2HgwNEldz/';

fetch(url, {
  headers: {
    'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
  }
}).then(async res => {
  const html = await res.text();
  console.log('HTML length:', html.length);

  // Decode HTML entities helper
  function decodeHtml(str) {
    return str
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'");
  }

  // OG Title
  let ogTitle = html.match(/property="og:title" content="([^"]*)"/)?.[1] ||
                html.match(/content="([^"]*)" property="og:title"/)?.[1] || 'NOT FOUND';
  console.log('\n=== OG Title ===');
  console.log(decodeHtml(ogTitle));

  // OG Description
  let ogDesc = html.match(/property="og:description" content="([^"]*)"/)?.[1] ||
               html.match(/content="([^"]*)" property="og:description"/)?.[1] || 'NOT FOUND';
  console.log('\n=== OG Description ===');
  console.log(decodeHtml(ogDesc));

  // All og:image tags
  const ogImgMatches1 = [...html.matchAll(/property="og:image" content="([^"]*)"/g)];
  const ogImgMatches2 = [...html.matchAll(/content="([^"]*)" property="og:image"/g)];
  const allOgImages = [...ogImgMatches1.map(x => x[1]), ...ogImgMatches2.map(x => x[1])];
  console.log('\n=== All OG Images ===');
  console.log('Total:', allOgImages.length);
  allOgImages.forEach((img, i) => {
    console.log(`[${i+1}] ${img}`);
  });

  // Also check twitter:image
  const twImgMatch = html.match(/name="twitter:image" content="([^"]*)"/)?.[1] ||
                     html.match(/content="([^"]*)" name="twitter:image"/)?.[1];
  console.log('\n=== Twitter Image ===');
  console.log(twImgMatch || 'NOT FOUND');

  // Look for carousel/multiple images in the page data
  // Instagram sometimes embeds image arrays in script tags
  console.log('\n=== Instagram Image Data in Scripts ===');
  
  // Look for fbcdn.net image URLs
  const fbcdnImages = [...new Set(
    [...html.matchAll(/https:\/\/[a-z0-9-]+\.cdninstagram\.com\/v\/[^\s"'<>]+/g)].map(m => m[0])
  )];
  console.log('cdninstagram.com images:', fbcdnImages.length);
  fbcdnImages.forEach((img, i) => {
    console.log(`  [${i+1}] ${img.substring(0, 120)}`);
  });

  // Look for scontent images
  const scontentImages = [...new Set(
    [...html.matchAll(/https:\/\/scontent[^\s"'<>]+\.(jpg|jpeg|png|webp)[^\s"'<>]*/g)].map(m => m[0])
  )];
  console.log('\nscontent images:', scontentImages.length);
  scontentImages.forEach((img, i) => {
    console.log(`  [${i+1}] ${img.substring(0, 120)}`);
  });

  // Extract structured data that might contain carousel images
  console.log('\n=== Script Tag Analysis ===');
  const scriptTags = [...html.matchAll(/<script[^>]*>([^<]{100,})<\/script>/g)];
  console.log('Script tags with >100 chars:', scriptTags.length);
  
  // Look for scripts with image data
  scriptTags.forEach((script, i) => {
    if (script[1].includes('scontent') || script[1].includes('cdninstagram')) {
      console.log(`Script [${i}] contains Instagram images`);
      // Extract image URLs from this script
      const imgUrls = [...script[1].matchAll(/https:\\\/\\\/[^\\"]+\.jpg[^\\"]{0,200}/g)].map(m => m[0].replace(/\\\//g, '/'));
      imgUrls.forEach((img, j) => {
        console.log(`  img[${j}]: ${img.substring(0, 120)}`);
      });
    }
  });

  // Sample of HTML around og:image
  const ogImgPos = html.indexOf('og:image');
  if (ogImgPos > 0) {
    console.log('\n=== HTML around og:image ===');
    console.log(html.substring(ogImgPos - 50, ogImgPos + 500));
  }

}).catch(e => console.error('Error:', e));
