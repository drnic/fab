fab = require( "../" )

// URLs below assume module hosted below /date path.
module.exports = fab

  ( fab.contentLength )
  ( fab.stringify )
  
  // URL: /date/date
  ( /\/date/ )
    ( fab.tmpl )
      ( "The date is <%= this.toDateString() %>." )
    ()

  // URL: /date/time
  ( /\/time/ )
    ( fab.tmpl )
      ( "The time is <%= this.toTimeString() %>." )
    ()
  
  // URL: /date
  ( new Date );