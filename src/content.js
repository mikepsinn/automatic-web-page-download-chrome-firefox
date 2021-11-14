// noinspection JSUnusedLocalSymbols,EqualityComparisonWithCoercionJS,RegExpRedundantEscape,SpellCheckingInspection
// noinspection JSUnusedLocalSymbols
/*
 *      Automatic Web Page Downloader - Background Page
 *
 *      A lot of code was copied from or inspired by the RecollWebext - WebExtension
 *      extension.
 *
 *      Copyright (C) 2017 jfd@recoll.org
 *      Copyright (C) 2016-2017 DW-dev
 *
 *      Distributed under the GNU General Public License version 2
 *      See LICENCE.txt file and http://www.gnu.org/licenses/
 */
"use strict"
/* Global variables */
var isFirefox
var menuAction
var autosave
var httpsAlso
var noMatchSave
var conflictSave
var downloadSubDir
var urlRules = {
	inc: [],
	exc: []
}
/* Initialize on script load */
chrome.storage.local.get(
	null,
	function(object){
		/* Load environment */
		isFirefox = object["environment-isfirefox"]
		/* Load options */
		loadOptions(object)
		addListeners()
	})
function loadOptions(object){
	/* for (var key in object) {
	 console.log("Content init: " + key + " => " + object[key]);
	 }*/
	autosave = object["options-autosave"]
	httpsAlso = object["options-https-also"]
	noMatchSave = object["options-nomatch-dosave"]
	conflictSave = object["options-conflict-dosave"]
	downloadSubDir = object["options-downloadsubdir"]
	var keys = ["options-url-include", "options-url-exclude"]
	var sks = ["inc", "exc"]
	for(var t = 0; t < 2; t++){
		var key = keys[t]
		var sk = sks[t]
		urlRules[sk] = []
		if(key in object){
			for(var i = 0; i < object[key].length; i++){
				urlRules[sk].push(object[key][i])
			}
		}
	}
}
/* Add listeners */
function addListeners(){
	window.addEventListener(
		"load",
		function(event){
			if(document.readyState == "complete"){
				if(autosave &&
				   (document.location.protocol == "http:" ||
				    (httpsAlso && document.location.protocol == "https:"))){
					maybeSave()
				}
			}
		}, false)
	/* Storage changed listener */
	chrome.storage.onChanged.addListener(
		function(changes, areaName){
			chrome.storage.local.get(null, loadOptions)
		})
	/* Message received listener */
	chrome.runtime.onMessage.addListener(
		function(message, sender, sendResponse){
			var panel
			switch(message.type) {
				/* Messages from background page */
				case "performAction":
					/* to confirm content script has been loaded */
					sendResponse({})
					menuAction = message.menuaction
					/* Wait for page to complete loading */
					if(document.readyState === "complete"){
						window.setTimeout(
							function(){
								performAction(message.srcurl)
							}, 50)
					} else {
						window.addEventListener(
							"load",
							function(event){
								if(document.readyState == "complete"){
									performAction(message.srcurl)
								}
							}, false)
					}
					break
				case "loadSuccess":
					loadSuccess(message.index, message.content,
						message.contenttype, message.alloworigin)
					break
				case "loadFailure":
					loadFailure(message.index)
					break
			}
		})
	/* Maybe addListeners() was called after doc complete. In which
	 * case we will never have the "load" event. This happens with
	 * "Open in new tab" for some reason. Initiate save at once. */
	if(document.readyState == "complete"){
		if(autosave &&
		   (document.location.protocol === "http:" ||
		    (httpsAlso && document.location.protocol == "https:"))){
			maybeSave()
		}
	}
}
/* This is called when we receive a message from the background page,
 initiated by a button or context menu choice */
function performAction(srcurl){
	if(menuAction == 0){
		/* Save page */
		doSave()
	} else if(menuAction == 1 || menuAction == 2){
		var hostname = location.hostname
		var sk, key
		if(menuAction == 1){
			sk = "inc"
			key = "options-url-include"
			doSave()
		} else {
			sk = "exc"
			key = "options-url-exclude"
		}
		/* Already there ? */
		for(var i = 0; i < urlRules[sk].length; i++){
			if(urlRules[sk][i][1] == hostname &&
			   urlRules[sk][i][2] == "domain"){
				return
			}
		}
		var rule = ["ca_" + hostname, hostname, "domain"]
		urlRules[sk].push(rule)
		/*console.log("Url rules: key: " + key + " new value: "
		 + urlRules[sk]);*/
		var obj = {}
		obj[key] = urlRules[sk]
		if(menuAction == 1){
			/* Also set autosave */
			obj["options-autosave"] = true
			if(document.location.protocol == "https:"){
				obj["options-https-also"] = true
			}
			/* Remove the 'save by default' option, otherwise the
			 positive rule makes no sense */
			obj["options-nomatch-dosave"] = false
		}
		chrome.storage.local.set(obj)
	}
}
/********************/
/* Copied from tested module in ../tested/wildcard.js */
function wildcard2RE(s){
	/* Quote some characters which are not special for wildcard exprs
	 (or which we don't want to support), and are special for
	 regexps */
	s = s.replace(/([\.\+\{\}\^\$])/g, "\\$1")
	/* Replace unescaped question marks with '.' and '*' with '.*'
	 Note that this does not work if the backslash is itself
	 escaped in the wildcard exp. Also we don't match / or : */
	s = s.replace(/(^|[^\\])\?/g, "$1[^/]").replace(/(^|[^\\])\*/g, "$1[^/]*")
	/* Replace '!' as first character of bracketed expr with '^' */
	s = s.replace(/(^|[^\\])\[!/g, "$1[^")
	/* Anchor expression */
	return "^" + s + "$"
}
function wildcardMatch(e, v){
	var re = RegExp(wildcard2RE(e))
	/*console.log("RE: " + re + " V: [" + v + "] result: " + re.test(v))*/
	return re.test(v)
}
/* End copied code ***************/
function maybeSave(){
	var location = document.location
	/* console.log("maybeSave. mtype " + document.contentType +
	 " url " + document.location.href); */
	/* Exclude some MIME types from automatic saving. They can still be saved by an explicit click */
	var excludedmimes = ["video/*", "audio/*", "image/*", "application/x-shockwave-flash"]
	for(var x = 0; x < excludedmimes.length; x++){
		if(wildcardMatch(excludedmimes[x], document.contentType)){
			console.log("Automatic-Web-Page-Downloader: " + document.contentType + " is excluded")
			return
		}
	}
	/* We are only called from the automatic save after load situation, and
	 the protocol (http or https), and checks against
	 autosave/https-also were performed in the listener.
	 So we just need to check the url against the selection/exclusion lists.
	 */
	var sks = ["exc", "inc"]
	var flags = [false, false]
	var hostname = location.hostname
	var href = location.href
	for(var j = 0; j < 2; j++){
		var sk = sks[j]
		var flag = false
		for(var i = 0; i < urlRules[sk].length && !flag; i++){
			var lpattern = urlRules[sk][i][1]
			var ptype = urlRules[sk][i][2]
			switch(ptype) {
				case "domain":
					// www.google.com matched by google.com and .com
					// www.agoogle.com not matched by google.com but matched by com
					// www.com.google. not matched by .com
					var pattern = lpattern
					if(pattern[0] != "."){
						pattern = "." + pattern
					}
					flag = hostname.endsWith(pattern) || (hostname == lpattern)
					console.log("Host match [" + lpattern + "] to [" +
					            hostname + "] -> " + flag)
					break
				case "wildcard":
					flag = wildcardMatch(lpattern, href)
					console.log("Wildcard match [" + lpattern + "] to [" + href +
					            "] -> " + flag)
					break
				case "regexp":
					var re = RegExp(lpattern)
					flag = (href.match(re) != null)
					console.log("Regexp match [" + lpattern + "] to [" + href +
					            "] -> " + flag)
					break
				default:
					console.log("Invalid " + sk + " rule " + urlRules[sk][i])
					break
			}
		}
		flags[j] = flag
	}
	console.log("maybeSave ? Exclude list match: " + flags[0] +
	            ". Include list match: " + flags[1])
	/* If both lists are empty, save by default, even if nomatchsave
	 is not set: the user did not bother to set rules, let the
	 autosave variable decide */
	// flags[0]: exclude. flags[1]: include
	if(urlRules["inc"].length == 0 && urlRules["exc"].length == 0){
		flags[1] = true
	} else {
		if(!flags[0] && !flags[1]){
			flags[1] = noMatchSave
		}
		if(flags[0] && flags[1]){
			flags[1] = conflictSave
		}
	}
	if(flags[1]){
		doSave()
	}
}
/* Return the content base file name for a given URL */
function getContentName(url){
	let loc = "Automatic-Web-Page-Downloader-c-" + recoll_md5.hex_md5(url) + ".rclwe"
	if(downloadSubDir){
		loc = downloadSubDir + "/" + loc
	}
	return loc
}
/* Return the metadata base file name path for a given url */
function getMetaName(url){
	let loc = "Automatic-Web-Page-Downloader-m-" + recoll_md5.hex_md5(url) + ".rclwe"
	if(downloadSubDir){
		loc = downloadSubDir + "/" + loc
	}
	return loc
}
function metadata(url, contentType, charset){
	return url + "\n" +
	       "WebHistory\n" +
	       contentType + "\n" +
	       "k:_unindexed:encoding=" + charset + "\n"
}
function doSave(){
	chrome.runtime.sendMessage({
		type: "setSaveBadge", text: "SAVE",
		color: "#0000E0"
	})
	/* Save metadata */
	var meta = metadata(document.location.href, document.contentType,
		document.characterSet)
	var mfn = getMetaName(document.location.href)
	chrome.runtime.sendMessage({
		type: "downloadFile",
		location: document.location.href,
		filename: mfn,
		data: meta,
	})
	/* Save data */
	var data = ""
	var dfn
	if(document.contentType.match(/(text|html|xml)/i)){
		data = document.documentElement.outerHTML
		dfn = getContentName(document.location.href)
	} else {
		dfn = getContentName(document.location.href)
	}
	chrome.runtime.sendMessage({
		type: "downloadFile",
		location: document.location.href,
		filename: dfn,
		data: data,
	});
}
