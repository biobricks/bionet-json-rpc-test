#!/usr/bin/env node

var async = require('async');
var stream = require('stream');
var fs = require('fs');
var http = require('http');
var router = require('routes')(); // server side router
var jayson = require('jayson');
var rpc = require('rpc-multistream');
var auth = require('rpc-multiauth');

var myAuth = auth({
  secret: "secret",
  cookie: {
    setCookie: true
  }
});

function login(res, username, password, cb) {

  if(username !== 'foo' || password !== 'bar') {
    return cb(new Error("invalid username or password"));
  }

  var userData = {
    username: username, 
    password: password,
    group: 'user'
  };

  myAuth.login(res, userData.username, userData, function(err, token) {
    // a bug in old versions of rpc-multiauth
    // sometimes means we get a string instead of an error object back
    if(typeof err === 'string') err = new Error(err);
    if(err) return cb(err);

    cb(null, token);
  });
}
var foo;

var jsonRPC = jayson.server(foo = unstreamify(login, {

  foo: function(curUser, f, cb) {
    console.log("ARGS:", arguments);
    cb(null, f + ": bar", null, 3);
  },

  bar: rpc.syncReadStream(function(curUser, a) {
    return fs.createReadStream('./test.txt', {encoding: 'utf8'});
  }),

  baz: function(curUser, a, cb) {
    cb(null, a+'lol', fs.createReadStream('./test.txt', {encoding: 'utf8'}));
  },

  fail: function(curUser, cb) {
    cb(new Error("something bad happened"));
  },

  user: {
    secret: function(curUser, cb) {
      cb(null, 42);
    }
  },

  admin: {
    admin_secret: function(curUser, cb) {
      cb(null, "praise bob");
    }
  }

})).middleware();

console.log(Object.keys(foo));

// inject a new first argument into a JSON-RPC call object
function injectFirstArg(obj, arg) {
  if(!obj.params) {
    obj.params = [arg];
  } else {
    obj.params = [arg].concat(obj.params);
  }
  console.log("OBJECT:", obj);
  return obj;
}

// convert normal js error to JSON-RPC error object
function jsonError(err, code) {
  return {code: code || 500, message: err.message || "Unknown error"};
}

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

function unstreamifyFunction(f, group) {
  return function(args, cb) {
    var res;

    if(group) {
      var userData = args[0];

      console.log("USER DATA:", userData);
      if(!userData) {
        return cb(jsonError(new Error("You must be logged in to access this function"), 401));
      }
      if(userData.group !== group) {
        return cb(jsonError(new Error("You must be in the " + group + " group to access this function"), 401));
      }
    }

    if(f._rpcOpts) { // is this an rpc-multistream syncStream function?
      if(f._rpcOpts.type === 'w') {
        return cb(new Error("Functions returning a write stream over the JSON-RPC 2.0 API"));
      }

      res = f.apply(null, args);
      unstreamifyResult(res, function(err, cbArgs) {
        if(err) return cb(jsonError(err));

        cb(null, [cbArgs]);
      })

    } else {

      args[args.length] = function() {
        if(arguments.length && arguments[0]) {
          return cb(jsonError(arguments[0]));
        }

        var cbArgs = Array.prototype.slice.call(arguments, 1); // convert to array

        
        unstreamifyResult(cbArgs, function(err, cbArgs) {
          if(err) return cb(jsonError(err));

          cb(null, cbArgs);
        });

      };
      f.apply(null, args);
    }
  }
}


function unstreamify(loginMethod, methods, o, group) {

  o = o || {};

  var fname;
  for(fname in methods) {
    if(!group && typeof methods[fname] === 'object') {
      unstreamify(loginMethod, methods[fname], o, fname);
      continue;
    }

    o[fname] = unstreamifyFunction(methods[fname], group);
  }

  if(loginMethod) {
    o.login = function(args, cb) {
      loginMethod.apply(null, args.concat([function(err) {
        if(err) return cb(jsonError(err));

        cb.apply(null, arguments);
      }]));
    }
  };

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

    // TODO we shouldn't do this if not using auth at all
    if(data.method === 'login') {
      data = injectFirstArg(data, res);
      req.body = data;
      jsonRPC(req, res);
      return;
    }

    myAuth(req, function(err, tokenData) {
      if(err) {
        data = injectFirstArg(data, null);
      } else {
        data = injectFirstArg(data, tokenData);
      }

      req.body = data;
      jsonRPC(req, res);

    });
  });
});

router.addRoute('/*', function(req, res, match) {
  res.end("<html><body>Main page</body></html>");
});

server.listen(3000, 'localhost');
