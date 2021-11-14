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
var ffVersion
var showSubmenu
var badgeTabId
/* Initialize on browser startup */
isFirefox = (navigator.userAgent.indexOf("Firefox") >= 0)
chrome.storage.local.set({"environment-isfirefox": isFirefox})
if(isFirefox){
	chrome.runtime.getBrowserInfo(
		function(info){
			ffVersion = info.version.substr(0, info.version.indexOf("."))
			initialize()
		})
} else {
	initialize()
}
function initialize(){
	chrome.storage.local.get(null,
		function(object){
			var context
			var opt
			for(var key in object){
				console.log("Background init: " + key + " => " + object[key])
			}
			/* Initialize or migrate options */
			var opdefaults = {
				"options-showsubmenu": true,
				"options-autosave": true,
				"options-https-also": true,
				"options-nomatch-dosave": true,
				"options-conflict-dosave": false,
				"options-downloadsubdir": ""
			}
			for(opt in opdefaults){
				if(!(opt in object)){
					object[opt] = opdefaults[opt]
				}
			}
			/* Update stored options */
			chrome.storage.local.set(object)
			/* Initialize local options */
			showSubmenu = object["options-showsubmenu"]
			//  Put downloadsubdir into a store that is accessed with a synchronous API so
			//  that it can be read by the chrome.downloads.onDeterminingFilename listener
			localStorage.setItem("downloadsubdir", object["options-downloadsubdir"])
			/* Add context menu items */
			context = showSubmenu ? "all" : "browser_action"
			chrome.contextMenus.create(
				{
					id: "indexnow", title: "Save this page for indexing",
					contexts: [context], enabled: true
				})
			chrome.contextMenus.create(
				{
					id: "separator", type: "separator",
					contexts: [context], enabled: true
				})
			chrome.contextMenus.create(
				{
					id: "sitealways", title: "Always Index This Site",
					contexts: [context], enabled: true
				})
			chrome.contextMenus.create(
				{
					id: "sitenever", title: "Never Index This Site",
					contexts: [context], enabled: true
				})
			/* Set button and menu states */
			chrome.tabs.query({lastFocusedWindow: true, active: true},
				function(tabs){
					setButtonAndMenuStates(tabs[0].id, tabs[0].url)
				})
			/* Add listeners */
			addListeners()
		})
}
function addListeners(){
	/* Storage changed listener */
	chrome.storage.onChanged.addListener(
		function(changes, areaName){
			chrome.storage.local.get(null,
				function(object){
					var context
					showSubmenu = object["options-showsubmenu"]
					if("options-showsubmenu" in changes){
						context = showSubmenu ? "all" : "browser_action"
						chrome.contextMenus.update("indexnow",
							{contexts: [context]})
						chrome.contextMenus.update("separator",
							{contexts: [context]})
						chrome.contextMenus.update("sitealways",
							{contexts: [context]})
						chrome.contextMenus.update("sitenever",
							{contexts: [context]})
						chrome.tabs.query({lastFocusedWindow: true, active: true},
							function(tabs){
								setButtonAndMenuStates(tabs[0].id, tabs[0].url)
							})
					}
				})
		})
	/* Browser action listener */
	chrome.browserAction.onClicked.addListener(
		function(tab){
			initiateAction(tab, 0)
		})
	/* Context menu listener */
	chrome.contextMenus.onClicked.addListener(
		function(info, tab){
			if(info.menuItemId == "indexnow"){
				initiateAction(tab, 0, null)
			} else if(info.menuItemId == "sitealways"){
				initiateAction(tab, 1, null)
			} else if(info.menuItemId == "sitenever"){
				initiateAction(tab, 2, null)
			}
		})
	/* Tab event listeners */
	chrome.tabs.onActivated.addListener(  /* tab selected */
		function(activeInfo){
			chrome.tabs.get(activeInfo.tabId,
				function(tab){
					setButtonAndMenuStates(activeInfo.tabId, tab.url)
				})
		})
	chrome.tabs.onUpdated.addListener(  /* URL updated */
		function(tabId, changeInfo, tab){
			setButtonAndMenuStates(tabId, tab.url)
		})
	/* Message received listener */
	chrome.runtime.onMessage.addListener(runAction)
	//  When this extension is not running in Firefox, this listener will set
	//  the downloadsubdir, the conflictAction, and block the saveAs dialog
	//  during the download process
	if(!isFirefox){
		chrome.downloads.onDeterminingFilename.addListener(function(item, suggest){
			//  Avoid conflicting with other extensions that have their own
			//  onDeterminingFilename listeners.  (Note that these types of
			//  listeners are run in the order that their extensions were
			//  installed and the last one wins.  So a poorly written listener
			//  has the potential to mess everything up for everyone else.)
			if(item.mime == "text/x-recoll-data"){
				var filename = item.filename
				var downloadsubdir = localStorage.getItem("downloadsubdir")
				if(downloadsubdir){
					//  Strip leading or trailing whitespace and slashes
					downloadsubdir = downloadsubdir.replace(/^[\s\/]+|[\s\/]+$/gm, "")
					filename = downloadsubdir + "/" + filename
				}
				suggest({filename: filename, conflictAction: "overwrite", saveAs: null})
			}
			return true
		})
	}
}
async function runAction(message){
	let result = {
		ok: false,
	}
	try {
		switch(message.type) {
			case "downloadFile":
				result.ok = await doDownload(message.data, message.location,
					message.filename)
				setSaveBadge("", "#000000")
				break
			case "setSaveBadge":
				setSaveBadge(message.text, message.color)
				break
		}
	} catch(e) {
		result.error = "[RCLWE] " + String(e)
		console.error(result.error)
	}
	return result
}
async function doDownload(data, location, filename){
	filename = location.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	filename = filename.replace("http_", "")
	filename = filename.replace("https_", "")
	filename = filename.replace("www_", "")
	filename = filename.replace("__", "")
	filename += ".html"
	/*console.log("doDownload: filename "+filename+" location "+location); */
	var blob = null
	if(data){
		blob = new Blob([data], {type: "text/x-recoll-data"})
		location = URL.createObjectURL(blob)
	}
	if(isFirefox){
		try {
			let id = await browser.downloads.download({
				filename: filename,
				url: location,
				saveAs: false,
				conflictAction: browser.downloads.FilenameConflictAction.OVERWRITE,
			})
			/*console.log("doDownload: downloads.download returned ", {id});*/
			var state
			var error
			do {
				state, error = await waitDownload(id)
			} while(browser.downloads.State.IN_PROGRESS === state)
			if(!state){
				state = browser.downloads.State.INTERRUPTED
				error = `Download ID not found, id: ${id}`
			}
			if(error){
				error = `Error save file:\n${filename}\nerror: ${error}`
			}
			if(browser.downloads.State.COMPLETE === state){
			} else {
				throw error
			}
			return id
		} catch(e) {
			e = String(e)
			console.error(e)
		} finally {
			if(blob){
				URL.revokeObjectURL(location)
			}
		}
	} else {  //  When not Firefox ...
		//  Create a link for the blob in the DOM
		var blobLink = document.createElement("a")
		blobLink.href = location
		// Set the filename to be used when downloading this link
		// (Must be file name only, no path is allowed here.  The path will
		// be added during the download by the onDeterminingFilename listener.)
		blobLink.download = filename.split("/").reverse()[0]

		// Trigger the click event on this link, i.e., download the file
		blobLink.click()
	}
	//  Release the blob URL (free up blob memory)
	URL.revokeObjectURL(blob)
}
function mswait(ms = 200){
	return new Promise(resolve => setTimeout(resolve, ms, ms))
}
async function waitDownload(id, maxWaitSec = 2){
	let downloadObj = null
	for(let i = 0; i < maxWaitSec * 5; i++){
		await mswait(200);
		[downloadObj] = await browser.downloads.search({id})
		if(downloadObj
		   && browser.downloads.State.IN_PROGRESS !== downloadObj.state){
			break
		}
	}
	return downloadObj || {}
}
function initiateAction(tab, menuaction, srcurl){
	if(specialPage(tab.url)){
		alertNotify("Cannot be used with these special pages:\n" +
		            "about:, moz-extension:,\n" +
		            "https://addons.mozilla.org,\n" +
		            "chrome:, chrome-extension:,\n" +
		            "https://chrome.google.com/webstore.")
	} else {
		/* normal page - save operations allowed, saved page - all
		 operations allowed */
		badgeTabId = tab.id
		chrome.tabs.sendMessage(tab.id,
			{
				type: "performAction",
				menuaction: menuaction, srcurl: srcurl
			},
			function(response){
				if(chrome.runtime.lastError != null ||
				   typeof response == "undefined"){
					/* no response received - content script not loaded in
					 active tab */
					chrome.tabs.executeScript(tab.id, {file: "content.js"},
						function(){
							chrome.tabs.sendMessage(tab.id, {
									type: "performAction",
									menuaction: menuaction,
									srcurl: srcurl
								},
								function(response){
									if(chrome.runtime.lastError != null ||
									   typeof response == "undefined"){
										/* no response received - content script
										 cannot be loaded in active tab*/
										alertNotify("Cannot be used with this page.")
									}
								})
						})
				}
			})
	}
}
function specialPage(url){
	return (url.substr(0, 6) == "about:" ||
	        url.substr(0, 14) == "moz-extension:" ||
	        url.substr(0, 26) == "https://addons.mozilla.org" ||
	        url.substr(0, 7) == "chrome:" ||
	        url.substr(0, 17) == "chrome-extension:" ||
	        url.substr(0, 34) == "https://chrome.google.com/webstore")
}
/* Set button and menu states function */
function setButtonAndMenuStates(tabId, url){
	if(specialPage(url)){
		chrome.browserAction.disable(tabId)
		if(isFirefox && ffVersion <= 54){
			/* Firefox 54- - icon not changed */
			chrome.browserAction.setIcon({
				tabId: tabId,
				path: "icon_16-disabled.png"
			})
		}
		chrome.browserAction.setTitle(
			{
				tabId: tabId,
				title: "Automatic Web Page Downloader - cannot be used with this page"
			})
		chrome.contextMenus.update("indexnow", {enabled: false})
		chrome.contextMenus.update("separator", {enabled: true})
		chrome.contextMenus.update("sitealways", {enabled: false})
		chrome.contextMenus.update("sitenever", {enabled: false})
	} else if(url.substr(0, 5) == "file:"){
		chrome.browserAction.enable(tabId)
		if(isFirefox && ffVersion <= 54){
			chrome.browserAction.setIcon({tabId: tabId, path: "icon_16.png"})
		}
		chrome.browserAction.setTitle({tabId: tabId, title: "Automatic Web Page Downloader"})
		chrome.contextMenus.update("indexnow", {enabled: true})
		chrome.contextMenus.update("separator", {enabled: true})
		chrome.contextMenus.update("sitealways", {enabled: false})
		chrome.contextMenus.update("sitenever", {enabled: false})
	} else {
		chrome.browserAction.enable(tabId)
		if(isFirefox && ffVersion <= 54){
			chrome.browserAction.setIcon({tabId: tabId, path: "icon_16.png"})
		}
		chrome.browserAction.setTitle({tabId: tabId, title: "Automatic Web Page Downloader"})
		chrome.contextMenus.update("indexnow", {enabled: true})
		chrome.contextMenus.update("separator", {enabled: true})
		chrome.contextMenus.update("sitealways", {enabled: true})
		chrome.contextMenus.update("sitenever", {enabled: true})
	}
}
function setSaveBadge(text, color){
	/*console.log("setSaveBadge: text [" + text + "] color " + color);*/
	chrome.browserAction.setBadgeText({tabId: badgeTabId, text: text})
	chrome.browserAction.setBadgeBackgroundColor({
		tabId: badgeTabId,
		color: color
	})
}
function alertNotify(message){
	chrome.notifications.create(
		"alert",
		{
			type: "basic", iconUrl: "icon_32.png", title: "Automatic-Web-Page-Downloader",
			message: "" + message
		});
}
