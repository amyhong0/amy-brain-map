// Vision API 테스트
async function testVisionAPI() {
  const imageUrl = 'https://scontent-ssn1-1.cdninstagram.com/v/t39.30808-6/445662224_1824635621565483_6931040645378848474_n.jpg?stp=dst-jpg_s640x640&_nc_cat=108&ccb=1-7&_nc_sid=18d74f&_nc_ohc=H3zZQb6rZL4Q7kNvgG7xHnC&_nc_ht=scontent-ssn1-1.cdninstagram.com&_nc_gid=A8w7B5qY7Y2pK3mN9zQ8w&oh=00_AYD3xQ2zZ8qY4r6t8wQ3w6e8r0t2y4u6i8o0p2q4s6t8u0&oe=676B1A2F';
  
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY || 'test-key'}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta/llama-3.2-11b-vision-instruct',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 이미지에 있는 모든 텍스트를 한국어로 추출해주세요.' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.2,
    }),
  });

  console.log('Vision API 응답 상태:', response.status);
  
  if (response.ok) {
    const data = await response.json();
    console.log('Vision API 결과:', data.choices[0]?.message?.content);
  } else {
    const errorText = await response.text();
    console.log('Vision API 에러:', errorText);
  }
}

// 브라우저 환경이 아니므로 node-fetch 필요하지만
// 현재 환경에서는 테스트 불가능
console.log('이 테스트는 브라우저나 Next.js API 환경에서 실행되어야 합니다.');