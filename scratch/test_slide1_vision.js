const NVIDIA_API_KEY = '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';

const slide1Url = 'https://scontent-ssn1-1.cdninstagram.com/v/t51.82787-15/751485594_17975848008086785_3988986728804083629_n.jpg?stp=c164.0.492.492a_dst-jpg_e35_s640x640_tt6&_nc_cat=110&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMyJ9&_nc_ohc=mfzf6M5JaWcQ7kNvwGNNOHg&_nc_oc=AdohRK7C7GKJWIgIpC1p1_m6WblVEQ6YDmOnEbwbbepuC7FSjiav-TcqBfwvRBAoR4U&_nc_zt=23&_nc_ht=scontent-ssn1-1.cdninstagram.com&_nc_gid=ox6aUk2L-HD1KnsKicQ69w&_nc_ss=7f689&oh=00_AQBVlauP5kZDdfIyqYWyPXNxStfQw1JiJ8H8CKaHjb6_lQ&oe=6A6F449A';

async function testSlide1() {
  console.log('Downloading Slide 1 image...');
  const res = await fetch(slide1Url, {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Referer': 'https://www.instagram.com/'
    }
  });
  console.log('Download status:', res.status);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  // Call Vision API with different prompts
  const prompts = [
    '이 이미지에 있는 모든 텍스트를 정확하게 추출해줘.',
    '이 이미지의 제목과 포스터 문구를 한글로 추출해줘.'
  ];

  for (const prompt of prompts) {
    console.log('\n--- Prompt:', prompt, '---');
    const apiRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 512,
        temperature: 0.1
      })
    });
    const data = await apiRes.json();
    console.log('Result:\n', data.choices[0]?.message?.content);
  }
}

testSlide1();
