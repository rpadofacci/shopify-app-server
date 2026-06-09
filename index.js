const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  res.writeHead(200);
  res.end(JSON.stringify({ status: 'ok' }));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
