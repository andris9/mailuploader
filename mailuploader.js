var fs = require("fs"),
    crypto = require("crypto"),
    MailParser = require("mailparser").MailParser,
    fetch = require("fetch");

module.exports.mailUploader = mailUploader;

function mailUploader(fileName, targetUrl, options, callback){
    if(!callback && typeof options=="function"){
        callback = options;
        options = undefined;
    }
    new MailUploader(fileName, targetUrl, options, callback).parse();
}

/**
 * 
 * 
 * @constructor
 * @param {String} fileName
 * @param {String} targetUrl
 * @param {Object} [options]
 * @param {Function} readyCallback
 */
function MailUploader(fileName, targetUrl, options, readyCallback){
    options = options || {};
    
    this.inputFileName = fileName;
    this.targetUrl = targetUrl;
    this.readyCallback = readyCallback;
    
    this.tempDir = options.tempDir || "/tmp/";
    
    this.additionalFields = options.additionalFields;
    
    if(this.tempDir.substr(-1)!="/"){
        this.tempDir += "/";
    }
    
    this.boundary = "-----MAILPARSER" + Date.now();
    this.responseFileName = sha1(this.boundary+Math.random());
    
    this.parsingStreams = 1;
    this.mailparser = new MailParser({streamAttachments: true});
    this.mailparser.on("attachment", this.handleIncomingAttachment.bind(this));
    this.mailparser.on("end", this.mailparserEnd.bind(this));
}

MailUploader.prototype.parse = function(){
    fs.createReadStream(this.inputFileName).pipe(this.mailparser);
}

MailUploader.prototype.handleIncomingAttachment = function(attachment){
    attachment.usedFileName = sha1(attachment.generatedFileName);
    
    attachment.saveStream = fs.createWriteStream(this.tempDir + attachment.usedFileName);
    attachment.stream.pipe(attachment.saveStream);
    
    this.parsingStreams++;
    
    attachment.stream.on("end", (function(){
        this.parsingStreams--;
        if(!this.parsingStreams){
            process.nextTick(this.handleFinalMail.bind(this));
        }
    }).bind(this));
}

MailUploader.prototype.mailparserEnd = function(mail){
    this.parsingStreams--;
    this.parsedMail = mail;
    
    if(!this.parsingStreams){
        process.nextTick(this.handleFinalMail.bind(this));
    }
}

MailUploader.prototype.handleFinalMail = function(){
    
    this.cidList = {};
    this.parsedMail.attachments.forEach((function(attachment){
        if(attachment.contentId){
            this.cidList[attachment.contentId] = attachment.generatedFileName;
        }
    }).bind(this));
    
    if(this.parsedMail.attachments && this.parsedMail.attachments.length){
        if(this.parsedMail.html){
            this.parsedMail.html = this.handleCID(this.parsedMail.html);
        }
        if(this.parsedMail.alternatives){
            for(var i=0, len = this.parsedMail.alternatives.length; i<len; i++){
                if(this.parsedMail.alternatives[i].contentType == "text/html"){
                    this.parsedMail.alternatives[i].content = this.handleCID(this.parsedMail.alternatives[i].content);
                }
            }
        }
    }
    
    process.nextTick(this.composeResponse.bind(this));
}

MailUploader.prototype.composeResponse = function(){
    var keys, i, len;
    this.responseStream = fs.createWriteStream(this.tempDir+this.responseFileName);
    
    if(this.additionalFields){
        keys = Object.keys(this.additionalFields);
        for(i=0, len=keys.length; i<len; i++){
            this.responseStream.write(this.addFormField(keys[i], this.additionalFields[keys[i]]));
        }
    }
    
    if(this.parsedMail.from && this.parsedMail.from.length){
        this.responseStream.write(this.addFormField("from", this.parsedMail.from[0].address+"; "+this.parsedMail.from[0].name));
    }
    
    if(this.parsedMail.to && this.parsedMail.to.length){
        this.responseStream.write(this.addFormField("to", this.parsedMail.to.map(function(to){
            return to.address+"; "+to.name
        }).join("\r\n")));
    }
    
    if(this.parsedMail.subject){
        this.responseStream.write(this.addFormField("subject", this.parsedMail.subject));
    }
    
    if(this.parsedMail.html){
        this.responseStream.write(this.addFormField("htmlBody", this.parsedMail.html));
    }
    
    if(this.parsedMail.text){
        this.responseStream.write(this.addFormField("textBody", this.parsedMail.text));
    }
    
    if(this.parsedMail.attachments && this.parsedMail.attachments.length){
        this.writeAttachments();
    }else{
        this.responseStream.end("--"+this.boundary+"--");
        this.sendToURL();
    }
}

MailUploader.prototype.writeAttachments = function(){
    this.curAttachment = this.curAttachment || 0;
    if(this.curAttachment >= this.parsedMail.attachments.length){
        this.responseStream.end("--"+this.boundary+"--");
        this.sendToURL();
        return;
    }
    var attachment = this.parsedMail.attachments[this.curAttachment],
        attachmentStream = fs.createReadStream(this.tempDir + attachment.usedFileName);
    
    this.responseStream.write("--"+this.boundary + "\r\n"+
           "Content-Disposition: form-data; name=\"file["+this.curAttachment+"]\"; filename=\""+(attachment.generatedFileName.replace(/"/g,"\\\""))+"\"\r\n"+
           "Content-Type: "+attachment.contentType+"\r\n"+
           "\r\n");
    
    attachmentStream.on("data", (function(chunk){
        if(this.responseStream.write(chunk) === false){
            attachmentStream.pause();
        }
    }).bind(this));
    
    this.responseStream.on("drain", (function(){
        attachmentStream.resume();
    }).bind(this));
    
    attachmentStream.on("end", (function(){
        fs.unlink(this.tempDir + attachment.usedFileName);
        this.responseStream.write("\r\n");
        this.curAttachment++;
        process.nextTick(this.writeAttachments.bind(this));
    }).bind(this));
}

MailUploader.prototype.addFormField = function(name, value){
    return "--"+this.boundary + "\r\n"+
           "Content-Disposition: form-data; name=\""+(name.replace(/"/g,"\\\""))+"\"\r\n"+
           "\r\n"+
           value+"\r\n";
}

MailUploader.prototype.handleCID = function(html){
    return html.replace(/(['"])cid:([^'"]+)(['"])/g, (function(match, quoteStart, cid, quoteEnd){
        if(cid in this.cidList){
            return quoteStart+"cid:"+sha1(this.cidList[cid])+"@node"+quoteEnd;
        }else{
            return match;
        }
    }).bind(this));
}

MailUploader.prototype.sendToURL = function(){
    var stream = fs.createReadStream(this.tempDir+this.responseFileName);
    stream.pause();
    
    fs.stat(this.tempDir+this.responseFileName, (function(err, stat){
        if(err || !stat.isFile()){
            this.readyCallback(new Error("Error saving file to disk"));
            return;
        }
        fetch.fetchUrl(this.targetUrl, {
            headers:{
                "content-type":"multipart/form-data; boundary=" + this.boundary
            },
            payloadSize: stat.size,
            payloadStream: stream
        }, (function(err, meta, body){
            fs.unlink(this.tempDir+this.responseFileName);
            this.readyCallback(err, meta, body);
        }).bind(this));
    }).bind(this));
    
}

function sha1(str){
    var hash = crypto.createHash("sha1");
    hash.update(str);
    return hash.digest("hex");
}
