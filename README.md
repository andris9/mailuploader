# mailuploader

Parse a raw e-mail message and post the contents (including attachments) to an URL.

Attahcments are uploaded as files, other fields (subject line, text and html body etc.) as
regular POST fields.

## Usage

Use the following function

    mailUploader(emailFile, targetUrl[, options], callback)
    
Where

  * **emailFile** is a file on disk, that contains a mime encoded e-mail message
  * **targetUrl** is the URL the POST request is made to
  * **options** is an optional options parameter
  * **callback** is the function that is run after the data is uploaded to `targetUrl`

Example

    var mailUploader = require("./test").mailUploader;
    
    mailUploader("email.eml", "http://example.com/receive.php", function(err){
        console.log(err || "SUCCESS!");
    });

### Receiving URL

A POST request is made to the `targetUrl` after the e-mail has been parsed. The POST fields used are the following:

  * **from** - the sender of the email in the form of `"email; Sender Name"`
  * **to** - receivers for the email in the form of `"email; Sender Name"` - can be in multiple lines when several recipients are defined
  * **subject** -  the subject line of the email
  * **htmlBody** - HTML body of the message
  * **textBody** - plaintext body of the message
  * **file[x]** - attached file where `x` is an incrementing number (useful for PHP which automatically makes an array out of it)

**NB!** all the POST fields (except attachments which are binary) are converted automatically to UTF-8, regardless of the original encoding

### Inline images in HTML body

HTML body can include inline images which are pointing to an attachment. In this case the `cid` url is always in the
following form: `cid:SHA1(filename)@node.ee` where `filename` is the filename defined with an attached file.

### options

options parameter can be used wit the following properties

  * **tempDir** (defualts to '/tmp') a directory, where temporary files (attachmetns and such) will be written
  * **additionalFields** is an object for setting additional POST parameters. For example `{user:"test"}` adds a value with key `user` and value `"test"` to the POST request

### callback

Callback function gets 3 parameters

    function(err, meta, body){}

Where

  * **err** is an Error object if an error occured
  * **meta** is the headers object of the `targetUrl`
  * **body** is the body of the `targetUrl`

## License

**MIT**