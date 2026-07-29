async function testPostApi() {
  console.log('Sending POST to http://localhost:3000/api/knowledge...');
  const res = await fetch('http://localhost:3000/api/knowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.instagram.com/p/Da-My7Ckn9R/',
      type: 'web'
    })
  });

  console.log('API response status:', res.status);
  const data = await res.json();
  console.log('\n--- Result Document ---');
  console.log('Title:', data.document?.title);
  console.log('Tags:', data.document?.tags);
  console.log('Topic:', data.document?.metadata?.topic);
  console.log('Content preview:\n', data.document?.content);
}

testPostApi();
