# mailuploader

## Usage

    var mailUploader = require("./test").mailUploader;
    
    mailUploader("email.eml", "http://example.com/receive.php", function(err){
        console.log(err || "SUCCESS!");
    });