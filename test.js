var mailUploader = require("./test").mailUploader;

mailUploader("suurkiri.eml", "http://tahvel.info/test.php",{additionalFields:{tere:"vana"}}, function(err){
    console.log(err && err.message || "SUCCESS!");
});