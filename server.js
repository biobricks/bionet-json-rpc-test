#!/usr/bin/env node

var http = require('http');
var router = require('routes')(); // server side router
var jayson = require('jayson');

var jsonRPC = jayson.server({

  foo: function(f, cb) {
    cb(null, f + ": bar");
  }

}).middleware({
//  end: false // call next() instead of res.end when done
});



var server = http.createServer(function(req, res) {
  var m = router.match(req.url);
  m.fn(req, res, m);
});


router.addRoute('/rpc', function(req, res, match) {
//  res.end("<html><body>RPC</body></html>");
  var data = '';
  req.on('data', function(d) {
    data += d;
  })

  req.on('error', function(err) {
    // TODO how to handle this?
    console.error(err);
  });

  req.on('end', function() {
    if(!data) {
      // TODO send proper http response code
      res.end("Bad request: Missing request body");
      return;
    }
    data = JSON.parse(data);
    if(!data) {
      // TODO invalid 
      res.end("Bad request: Invalid JSON");
      return;
    }    
    
    req.body = data;
    jsonRPC(req, res);

  });
});

router.addRoute('/*', function(req, res, match) {
  res.end("<html><body>Main page</body></html>");
});


server.listen(2000, 'localhost');
