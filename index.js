module.exports = ( function source() {

  fab = function() {
    var stack = [];
    
    return collect.apply( this, arguments );
  
    function collect( fn ) {
      var
        args = stack.slice.call( arguments ),
        length = args.length;
      
      if ( !length ) fn = fab.self;
  
      if ( length > 1 ) fn = fab( fn ).apply( this, args.slice( 1 ) );
      
      fn = ( fn && fab[ fn.constructor.name ] || fab.body )( fn );
      
      stack.unshift( fn );
      
      return reduce();
    }
    
    function reduce() {
      if ( stack[ 0 ].length ) return collect;
  
      if ( stack.length == 1 ) return stack.shift();
      
      if ( stack[ 1 ] == fab.self ) {
        var app = stack[ 0 ];
        stack.splice( 1, 1 );
        reduce();
        stack.unshift( app );
      }
      
      stack.splice( 0, 2, stack[ 1 ]( stack[ 0 ] ) );
      return reduce();
    }
  }
  
  fab.body = function( obj ) {
    return function() {
      var out = this({ body: obj });
      if ( out ) out();
    }
  }
  
  fab.map = function( fn ) {
    return function( app ) {
      return function() {
        var out = this;
        return app.call( function listener( obj ) {
          if ( obj ) arguments[ 0 ] = fn.call( obj, obj );      
          out = out.apply( this, arguments );
          
          return listener;
        })
      }
    }
  }
  
  fab.tap = function( fn ) {
    return function( app ) {
      return function() {
        fn();
        return app.call( this );    
      }
    }
  }
  
  fab.echo = function() {
    return this;
  }
  
  fab.method = ( function( names ) {
    for ( var name; name = names.pop(); ) method[ name ] = method( name );
      
    return method;
  
    function method() {
      var
        methods = {},
        len = arguments.length;
      
      for ( var i = 0; i < len; i++ ) {
        methods[ arguments[ i ] ] = true;
      }
        
      return function( hit ) {
        return function( miss ) {
          return function() {
            var out = this;
            return function( head ) {
              var app = head.method in methods ? hit : miss;
              
              app = app.call( out );
              if ( app ) app = app( head );
              
              return app;
            }
          }
        }
      }
    }
  })( [ "GET", "POST", "PUT", "DELETE" ] )
  
  fab.path = function( pattern ) {
    var
      proto = Array.prototype,
      match = {
        String: function( url ) {
          if ( path.indexOf( pattern ) ) return false;
  
          url.pathname = url.pathname.substr( pattern.length );
          return true;
        },
        
        RegExp: function( url ) {
          var match = false;
  
          url.pathname = url.pathname.replace( pattern, function() {
            match = true;
  
            var capture = proto.slice.call( arguments, 1, -2 );
            
            if ( !url.capture ) url.capture = capture;
            else proto.push.apply( url.capture, capture );
  
            return "";
          });
          
          return match;
        }
      }[ pattern.constructor.name ];
    
    return function( hit ) {
      return function( miss ) {
        return function() {
          var out = this;
          return function( head ) {
            var app = match( head.url ) ? hit : miss;

            app = app.call( out );
            if ( app ) app = app( head );
            
            return app;
          }
        }
      }
    }
  }
  
  fab.capture = fab.map( function( obj ) {
    return { body: obj.url ? obj.url.capture : [] };
  })( fab.echo )
  
  fab.status = function( code ) {
    code = +code;
    return function() {
      var out = this({ status: code });
      if ( out ) out();
    }
  }
  
  fab.stringify = fab.map( function( obj ) {
    var body = obj.body;
    if ( typeof body != "string" ) obj.body = JSON.stringify( body );
    return obj;
  })

  fab.tmpl = function( source ) {
    var fn;
  
    source.call( function( obj ) {
      fn = new Function(
        "var p=[];p.push('" +
        obj.body
          .replace( /[\r\t\n]/g, " " )
          .replace( /'(?=[^%]*%>)/g, "\t" )
          .split( "'" ).join( "\\'" )
          .split( "\t" ).join( "'" )
          .replace( /<%=(.+?)%>/g, "',$1,'" )
          .split( "<%" ).join( "');" )
          .split( "%>" ).join( "p.push('" )
          + "');return p.join('');" );
    });
    
    return function( app ) {
      // TODO: fn might not be defined yet for async
      app = fab.map( function( obj ) {
        obj.body = fn.call( obj.body );
        return obj;
      })( app );
  
      return function() { return app.call( this ) };
    }
  };
   
  fab.nodejs = function( app ) {
    var url = require( "url" );
  
    return function() {
      var
        request = arguments[ 0 ],
        response = arguments[ 1 ],
        headers = undefined,
        status = 200,
        _encoding = "ascii",
        inbound = app.call( listener );
      
      if ( inbound ) {
        inbound = inbound({
          method: request.method,
          headers: request.headers,
          url: url.parse( request.url )
        });
      }
      
      if ( inbound ) {
        request
          .addListener( "end", inbound )
          .addListener( "data", function( body ) {
            if ( inbound ) inbound = inbound({ body: body });
          })
      }
  
      function listener( obj ) {
        if ( arguments.length ) {
  
          if ( "status" in obj ) {
            status = obj.status;
          }
  
          if ( "headers" in obj ) {
            if ( headers ) process.mixin( headers, obj.headers );
            else headers = obj.headers;
          }
  
          if ( "_encoding" in obj ) {
            _encoding = obj._encoding;
          }
    
          if ( "body" in obj ) {
            if ( headers !== false ) {
              response.writeHead( status, headers || {} );
              headers = false;
            }
            
            response.write( obj.body, _encoding );
          }
  
          return listener;
        }
        
        else {
          if ( headers !== false ) {
            response.writeHead( status, headers || {} );
            headers = false;
          }
          
          response.end();
        }
      }
    }
  }
  
  fab.nodejs.contentLength = fab.map( function( obj ) {
    if ( typeof obj.body == "string" ) {
      ( obj.headers = obj.headers || {} )
        [ "content-length" ] = process._byteLength( obj.body );
    }
    
    return obj;
  })
  
  fab.nodejs.fs = function( app ) {
    var fs = require( "fs" );
      
    return function() {
      var out = this;

      return app.call( function( obj ) {
        var path = obj.body;

        fs.readFile( path, "utf8", function( err, data ) {
          out({
            body: data || "File not found: " + path,
            status: err ? 404 : 200
          })();
        });    
      })
    }
  }
  
  fab.nodejs.http = function( loc ) {
    loc = require( "url" ).parse( loc )
  
    var client = require( "http" )
      .createClient( loc.port || 80, loc.hostname );
  
    return function() {
      var out = this;
  
      return function( head ) {
        head.headers.host = loc.hostname;
        
        client
          .request(
            head.method,
            loc.pathname + head.url.pathname + ( head.url.search || "" ),
            head.headers
          )
          .addListener( "response", function( response ) {
            back({
              status: response.statusCode,
              headers: response.headers
            });
          
            response
              .addListener( "data", function( chunk ) {
                out({ body: chunk });
              })
              .addListener( "end", out )
              .setBodyEncoding( "utf8" );
          })
          .close();
      }
    }
  }
 
  fab.self = function( obj ){ return obj };
  
  fab.Function = fab.self;
  fab.RegExp = fab.path;
  fab.Number = fab.status;
  
  for ( var name in fab ) {
    var app = fab[ name ];
    for ( name in app ) {
      fab[ name ] = app[ name ];
    }
  }
  
  fab.toString = function(){ return "(" + source + ")()" };
  
  return fab;
})()