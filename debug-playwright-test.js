// Playwright로 Instagram 캐러셀 스크린샷 찍기 테스트
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const NVIDIA_API_KEY = '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';

const IG_URL = 'https://www.instagram.com/p/Da2HgwNEldz/';

async function analyzeImageWithVision(base64Img, label) {
  const dataUrl = `data:image/jpeg;base64,${base64Img}`;
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.2-11b-vision-instruct',
        messages: [{
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `이 인스타그램 슬라이드 이미지(${label})에 있는 모든 텍스트를 빠짐없이 정확하게 추출해주세요. 
텍스트가 없다면 "텍스트 없음"이라고만 답하세요.
텍스트가 있다면 이미지에서 보이는 그대로 추출해주세요.`
            },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 1024,
        temperature: 0.1,
      })
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } else {
      const err = await res.text();
      console.log('Vision API error:', err.substring(0, 200));
      return '';
    }
  } catch(e) {
    console.log('Vision API exception:', e.message);
    return '';
  }
}

async function scrapeInstagramCarousel(url) {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  
  const page = await context.newPage();
  
  // 불필요한 리소스 차단 (속도 향상)
  await page.route('**/*.{woff,woff2,ttf,otf}', route => route.abort());
  await page.route('**/logging/**', route => route.abort());
  await page.route('**/analytics/**', route => route.abort());
  
  const screenshots = [];
  const outDir = './debug-playwright-screenshots';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  
  try {
    console.log('Navigating to Instagram...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // 잠시 대기 (JS 렌더링)
    await page.waitForTimeout(3000);
    
    // 팝업/모달 닫기 시도
    try {
      // "로그인하지 않고 계속" 버튼 찾기
      const notNowBtn = page.locator('text=나중에', { hasText: '나중에' }).first();
      if (await notNowBtn.isVisible({ timeout: 2000 })) {
        await notNowBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}
    
    try {
      // Close/X 버튼
      const closeBtn = page.locator('[aria-label="닫기"]').first();
      if (await closeBtn.isVisible({ timeout: 2000 })) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}
    
    // 게시글 이미지 영역 찾기
    await page.waitForTimeout(2000);
    
    // 현재 페이지 스크린샷
    const fullPageShot = await page.screenshot({ fullPage: false });
    fs.writeFileSync(path.join(outDir, 'full_page.jpg'), fullPageShot);
    console.log('Full page screenshot saved');
    
    // 캐러셀 이미지 영역 찾기 - article > img 또는 carousel
    const postArea = page.locator('article').first();
    const postExists = await postArea.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Post article visible:', postExists);
    
    if (postExists) {
      // 게시글 영역만 스크린샷
      const postShot = await postArea.screenshot();
      const postBase64 = postShot.toString('base64');
      screenshots.push({ label: '게시글 전체', base64: postBase64 });
      fs.writeFileSync(path.join(outDir, 'post_area.jpg'), postShot);
      console.log('Post area screenshot saved');
    }
    
    // 이미지 슬라이더/캐러셀 컨트롤 찾기
    // Instagram 캐러셀 "다음" 버튼
    const nextSelectors = [
      '[aria-label="다음"]',
      '[aria-label="Next"]', 
      'button[aria-label*="next" i]',
      'button[aria-label*="다음"]',
      '._9zm2',  // Instagram internal class
      '.coreSpriteRightChevron',
    ];
    
    let slideCount = 0;
    let hasNext = false;
    
    // 첫 번째 슬라이드 스크린샷
    for (const selector of nextSelectors) {
      const nextBtn = page.locator(selector).first();
      hasNext = await nextBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasNext) {
        console.log('Found carousel next button:', selector);
        
        // 이미지 영역 스크린샷 찍기 + 다음 버튼 클릭 반복
        for (let i = 0; i < 10; i++) {
          // 현재 슬라이드의 이미지 캡처
          const imgArea = page.locator('article img').first();
          if (await imgArea.isVisible({ timeout: 2000 }).catch(() => false)) {
            const imgShot = await imgArea.screenshot();
            const imgBase64 = imgShot.toString('base64');
            screenshots.push({ label: `슬라이드 ${i + 1}`, base64: imgBase64 });
            fs.writeFileSync(path.join(outDir, `slide_${i + 1}.jpg`), imgShot);
            console.log(`Slide ${i+1} screenshot saved (${imgShot.length} bytes)`);
            slideCount++;
          }
          
          // 다음 버튼 클릭
          const stillVisible = await nextBtn.isVisible({ timeout: 1000 }).catch(() => false);
          if (!stillVisible) {
            console.log('No more slides');
            break;
          }
          await nextBtn.click();
          await page.waitForTimeout(800);
        }
        break;
      }
    }
    
    if (slideCount === 0) {
      console.log('No carousel slides found, capturing article images...');
      // 단일 이미지 게시글이거나 캐러셀 버튼을 못 찾은 경우
      const imgs = page.locator('article img');
      const imgCount = await imgs.count();
      console.log('Images in article:', imgCount);
      
      for (let i = 0; i < Math.min(imgCount, 3); i++) {
        const img = imgs.nth(i);
        if (await img.isVisible({ timeout: 1000 }).catch(() => false)) {
          const shot = await img.screenshot();
          const base64 = shot.toString('base64');
          screenshots.push({ label: `이미지 ${i+1}`, base64 });
          fs.writeFileSync(path.join(outDir, `article_img_${i+1}.jpg`), shot);
          console.log(`Article image ${i+1} saved`);
        }
      }
    }
    
  } catch(e) {
    console.error('Scraping error:', e.message);
    // 오류 발생 시에도 현재 페이지 스크린샷
    try {
      const errShot = await page.screenshot();
      fs.writeFileSync(path.join(outDir, 'error_state.jpg'), errShot);
      console.log('Error state screenshot saved');
    } catch {}
  } finally {
    await browser.close();
  }
  
  return screenshots;
}

(async () => {
  console.log('=== Playwright Instagram Carousel Scraper ===');
  console.log('URL:', IG_URL);
  
  const screenshots = await scrapeInstagramCarousel(IG_URL);
  console.log('\nTotal screenshots:', screenshots.length);
  
  if (screenshots.length > 0) {
    console.log('\n=== Vision API Analysis ===');
    for (const shot of screenshots) {
      console.log(`\nAnalyzing: ${shot.label}`);
      const text = await analyzeImageWithVision(shot.base64, shot.label);
      console.log('Text result:', text.substring(0, 200));
    }
  }
})();
