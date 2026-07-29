// 개선된 Playwright Instagram 캐러셀 스크레이퍼
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
              text: `이 인스타그램 슬라이드 이미지에 있는 모든 텍스트를 정확하게 추출해주세요.
텍스트가 없거나 아트워크/사진만 있으면 "텍스트 없음"이라고만 답하세요.
텍스트가 있으면 이미지에 보이는 그대로 추출하세요 (한국어, 영어 모두).`
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
      console.log(`  Vision API error (${res.status}):`, err.substring(0, 200));
      return '';
    }
  } catch(e) {
    console.log('  Vision API exception:', e.message);
    return '';
  }
}

async function scrapeInstagramCarousel(url) {
  console.log('Launching browser...');
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  
  const page = await context.newPage();
  const outDir = './debug-playwright-screenshots2';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  
  const screenshots = [];
  
  try {
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded');
    
    // 캐러셀 이미지 영역을 직접 찾기 - Instagram은 로그인 없이도 게시글 표시
    // 이미지 영역 셀렉터: 캐러셀 컨테이너
    
    // 첫 번째 슬라이드 스크린샷 (이미지 영역 클립)
    // 실제로 보이는 이미지 영역 좌표 확인
    const slideArea = await page.evaluate(() => {
      // 캐러셀 이미지 래퍼 찾기
      const selectors = [
        'li[role="listitem"] img',
        'article img',
        'div[role="presentation"] img',
        'img[style*="object-fit"]',
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          return {
            selector: sel,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            src: el.src?.substring(0, 80)
          };
        }
      }
      
      // 게시글 article 자체
      const article = document.querySelector('article');
      if (article) {
        const rect = article.getBoundingClientRect();
        return {
          selector: 'article',
          x: rect.x, y: rect.y,
          width: rect.width, height: rect.height
        };
      }
      return null;
    });
    
    console.log('Slide area:', JSON.stringify(slideArea));
    
    // 캐러셀 "다음" 버튼 찾기
    const nextBtnExists = await page.locator('[aria-label="다음"]').isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Next button exists:', nextBtnExists);
    
    // 이미지 영역 스크린샷 (고정 클립)
    // 스크린샷에서 본 이미지: 약 x=196, y=92, width=470, height=598
    const clipArea = slideArea && slideArea.width > 100 ? {
      x: Math.max(0, slideArea.x - 10),
      y: Math.max(0, slideArea.y - 10),
      width: Math.min(slideArea.width + 20, 700),
      height: Math.min(slideArea.height + 20, 700),
    } : {
      x: 196, y: 92, width: 470, height: 600
    };
    
    console.log('Clip area:', JSON.stringify(clipArea));
    
    // 슬라이드 캡처 루프
    let slideIndex = 0;
    const maxSlides = 10;
    const seenContents = new Set();
    
    while (slideIndex < maxSlides) {
      // 현재 슬라이드 캡처
      const shot = await page.screenshot({ clip: clipArea });
      const base64 = shot.toString('base64');
      
      // 중복 체크 (같은 이미지 반복 캡처 방지)
      const fingerprint = base64.substring(100, 200);
      if (seenContents.has(fingerprint)) {
        console.log(`Slide ${slideIndex + 1}: duplicate, stopping`);
        break;
      }
      seenContents.add(fingerprint);
      
      const filename = path.join(outDir, `slide_${slideIndex + 1}.jpg`);
      fs.writeFileSync(filename, shot);
      console.log(`Slide ${slideIndex + 1} saved: ${shot.length} bytes`);
      screenshots.push({ label: `슬라이드 ${slideIndex + 1}`, base64, path: filename });
      
      slideIndex++;
      
      // 다음 버튼 클릭
      const nextBtn = page.locator('[aria-label="다음"]').first();
      const visible = await nextBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (!visible) {
        console.log('No more next button, carousel ended');
        break;
      }
      
      await nextBtn.click();
      await page.waitForTimeout(600);
    }
    
    console.log(`\nCaptured ${screenshots.length} slides`);
    
  } catch(e) {
    console.error('Error:', e.message);
    const errShot = await page.screenshot();
    fs.writeFileSync(path.join(outDir, 'error.jpg'), errShot);
  } finally {
    await browser.close();
  }
  
  return screenshots;
}

(async () => {
  console.log('=== Playwright Instagram Carousel Scraper v2 ===');
  
  const screenshots = await scrapeInstagramCarousel(IG_URL);
  
  console.log('\n=== Vision API Analysis ===');
  const results = [];
  for (const shot of screenshots) {
    console.log(`\nAnalyzing ${shot.label}...`);
    const text = await analyzeImageWithVision(shot.base64, shot.label);
    console.log(`Result: ${text.substring(0, 200)}`);
    results.push({ label: shot.label, text });
  }
  
  console.log('\n\n=== FINAL COMBINED TEXT ===');
  results.forEach(r => {
    if (r.text && !r.text.includes('텍스트 없음')) {
      console.log(`[${r.label}]`);
      console.log(r.text);
      console.log('---');
    }
  });
})();
