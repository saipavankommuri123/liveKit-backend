import http from 'http';

const postData = JSON.stringify({
  room: 'test-room',
  identity: 'user-4216'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\nRESPONSE:');
    console.log(data);
    try {
      const json = JSON.parse(data);
      console.log('\nPARSED JSON:');
      console.log(json);
    } catch (e) {
      console.log('Failed to parse as JSON');
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
