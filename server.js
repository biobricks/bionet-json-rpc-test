#!/usr/bin/env node

var async = require('async');
var stream = require('stream');
var fs = require('fs');
var http = require('http');
var router = require('routes')(); // server side router
var jayson = require('jayson');
var rpc = require('rpc-multistream');

var jsonRPC = jayson.server(unstreamify({

  foo: function(f, cb) {
    cb(null, f + ": bar");
  },

  bar: rpc.syncReadStream(function(a) {
    return fs.createReadStream('./server.js', {encoding: 'utf8'});
  }),

  baz: function(a, cb) {
    cb(null, 'lol', fs.createReadStream('./server.js', {encoding: 'utf8'}));
  }

})).middleware();

function streamToArray(s, cb) {
  var onlyStrings = true;
  var data = [];
  s.on('data', function(d) {
    data.push(d);
    if(typeof d !== 'string') {
      onlyStrings = false;
    }
  });
  s.on('end', function() {
    if(onlyStrings) {
      cb(null, data.join(''));
    } else {
      cb(null, data);
    }
  })
  s.on('error', cb);
}

function unstreamifyResult(res, cb) {
  if(res instanceof stream.Readable) {
    streamToArray(res, cb);
  }
  if(res instanceof Array) {
    async.eachOf(res, function(item, i, next) {
      if(item instanceof stream.Readable) {
        streamToArray(item, function(err, item) {
          if(err) return next(err);
          
          res[i] = item;
          next();
        });
      } else {
        next();
      }
    }, function(err) {
      if(err) return cb(err);
      cb(null, res);
    });
  }
}

function unstreamifyFunction(f) {
  return function() {
    var res;

    // assume function is async if last argument is a callback
    if(!arguments.length || typeof arguments[arguments.length-1] !== 'function') {
      // we don't support functions without a callback
      // since JSON-RPC 2.0 does not support streams
      // and stream-returning functions are the only non-async functions allowed
      return;
    }

    var cb = arguments[arguments.length-1];

    var args = Array.prototype.slice.call(arguments, 0, arguments.length-1);

    if(f._rpcOpts) { // is this an rpc-multistream syncStream function?
      if(f._rpcOpts.type === 'w') {
        return cb(new Error("Functions returning a write stream over the JSON-RPC 2.0 API"));
      }

      res = f.apply(null, args);
      unstreamifyResult(res, cb)

    } else {

      args[args.length] = function() {
        if(arguments.length && arguments[0]) {
          return cb(arguments[0]);
        }

        var cbArgs = Array.prototype.slice.call(arguments, 0); // convert to array
        
        unstreamifyResult(cbArgs, cb);
      };
      f.apply(null, args);
    }
  }
}

function unstreamify(methods) {
  if(typeof methods === 'function') {
    return unstreamifyFunction(methods) 
  }

  var o = {};

  var fname;
  for(fname in methods) {
    o[fname] = unstreamifyFunction(methods[fname]);
  }

  return o;
}

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


server.listen(3000, 'localhost');
