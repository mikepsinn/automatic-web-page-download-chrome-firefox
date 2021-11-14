// noinspection JSUnusedLocalSymbols
// noinspection JSUnusedLocalSymbols
/*
 *      Automatic Web Page Downloader - Options page
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
/* Listener for options page load */
document.addEventListener("DOMContentLoaded", onLoadPage, false)
var urlRules = {
	inc: [],
	exc: []
}
function onLoadPage(event){
	/* Load options from local storage */
	console.log("ONLOADPAGE")
	chrome.storage.local.get(null,
		function(object){
			var i, t
			var checkboxes = [
				"options-autosave",
				"options-showsubmenu",
				"options-httpsalso",
				"options-nomatch-dosave",
				"options-conflict-dosave"
			]
			for(i = 0; i < checkboxes.length; i++){
				document.getElementById(checkboxes[i]).checked =
					object[checkboxes[i]]
			}
			let dldsbd = ""
			if("options-downloadsubdir" in object){
				dldsbd = object["options-downloadsubdir"]
			}
			document.getElementById("options-downloadsubdir").value = dldsbd
			var keys = ["options-url-include", "options-url-exclude"]
			var sks = ["inc", "exc"]
			for(t = 0; t < 2; t++){
				var key = keys[t]
				var sk = sks[t]
				if(key in object){
					for(i = 0; i < object[key].length; i++){
						urlRules[sk].push(object[key][i])
					}
				}
			}
			updateRulesTables()
		})
	document.getElementById("include-button-add").addEventListener(
		"click", onClickIncludeAdd, false)
	document.getElementById("include-button-delete").addEventListener(
		"click", onClickIncludeDelete, false)
	document.getElementById("exclude-button-add").addEventListener(
		"click", onClickExcludeAdd, false)
	document.getElementById("exclude-button-delete").addEventListener(
		"click", onClickExcludeDelete, false)
	document.getElementById("options-autosave").addEventListener(
		"click", onClickAutosave, false)
	document.getElementById("options-save-button").addEventListener(
		"click", onClickSave, false)
	document.removeEventListener("DOMContentLoaded", onLoadPage, false)
}
function prettyDOM(node, indent = 0){
	let str = ""
	if(node){
		str += " ".repeat(indent) + (node.tagName || node.textContent) + "\n"
		for(let child of node.childNodes){
			str += prettyDOM(child, indent + 2)
		}
	}
	return str
}
function updateRulesTables(){
	var keys = ["options-url-include", "options-url-exclude"]
	var sks = ["inc", "exc"]
	/* Build the 2 tables for included and excluded patterns */
	var caption = "URL include rules"
	for(let t = 0; t < 2; t++){
		var key = keys[t]
		var sk = sks[t]
		var html = "<table><caption>" + caption + "</caption>\n" +
		           "<tr><th style=\"text-align:left\">" +
		           "<input id=\"ckb-" + sk + "-all\" type=\"checkbox\"/>" +
		           "</th><th>Name</th><th>Pattern</th>" +
		           "<th>PatternType</th></tr>"
		for(let i = 0; i < urlRules[sk].length; i++){
			html += "<tr><td style=\"text-align:left\">" +
			        "<input id=\"ckb-" + sk + "-" + i + "\" type=\"checkbox\"/>" +
			        "</td>"
			html += "<td>" + urlRules[sk][i][0] + "</td>"
			html += "<td>" + urlRules[sk][i][1] + "</td>"
			html += "<td>" + urlRules[sk][i][2] + "</td></tr>"
		}
		if(urlRules[sk].length == 0){
			html += "<tr><td>" +
			        "<input id=\"ckb-" + sk + "-0\" type=\"checkbox\"/></td>"
			html += "<td> </td><td> </td><td> </td></tr>"
		}
		html = html + "</table>"
		/* Avoid "unsafe assign to innerHTML by doing complicated stuff */
		let elt = document.getElementById(key)
		elt.innerHTML = ""
		const parser = new DOMParser()
		const parsed = parser.parseFromString(html, "text/html")
		/*console.log("PARSED TREE: " + prettyDOM(parsed));*/
		const tags = parsed.getElementsByTagName("table")
		for(const tag of tags){
			/*console.log("Appendchild" + tag.innerHTML);*/
			elt.appendChild(tag)
		}
		caption = "URL exclude rules"
	}
	document.getElementById("ckb-inc-all").addEventListener(
		"click", onClickIncludeSelectAll, false)
	document.getElementById("ckb-exc-all").addEventListener(
		"click", onClickExcludeSelectAll, false)
}
function onClickRuleAdd(key, sk){
	var name = document.getElementById(key + "-input-name").value
	var val = document.getElementById(key + "-input-value").value
	var tp = document.getElementById(key + "-select-type").value
	console.log("onClickRuleAdd: urlRules[" + sk + "].push([" + name + ", " + val +
	            ", " + tp + "])")
	urlRules[sk].push([name, val, tp])
	/* We have a positive rule: it makes no sense to have save by default */
	document.getElementById("options-nomatch-dosave").checked = false
	onClickSave()
}
function onClickRuleDelete(sk){
	var i
	var newlist = []
	for(i = 0; i < urlRules[sk].length; i++){
		var id = "ckb-" + sk + "-" + i
		if(!document.getElementById(id).checked){
			newlist.push(urlRules[sk][i])
		}
	}
	urlRules[sk] = newlist
	onClickSave()
}
function onClickRuleSelectAll(sk){
	var i
	var ck = document.getElementById("ckb-" + sk + "-all").checked
	for(i = 0; i < urlRules[sk].length; i++){
		document.getElementById("ckb-" + sk + "-" + i).checked = ck
	}
}
function onClickIncludeAdd(event){
	onClickRuleAdd("include", "inc")
}
function onClickIncludeDelete(event){
	onClickRuleDelete("inc")
}
function onClickIncludeSelectAll(event){
	onClickRuleSelectAll("inc")
}
function onClickExcludeAdd(event){
	onClickRuleAdd("exclude", "exc")
}
function onClickExcludeDelete(event){
	onClickRuleDelete("exc")
}
function onClickExcludeSelectAll(event){
	onClickRuleSelectAll("exc")
}
/* Enable or Disable options */
function onClickAutosave(event){
	document.getElementById("options-httpsalso").disabled =
		!document.getElementById("options-autosave").checked
}
/* Save options */
function onClickSave(event){
	var checkboxnames = [
		"options-showsubmenu",
		"options-autosave",
		"options-httpsalso",
		"options-nomatch-dosave",
		"options-conflict-dosave"
	]
	var i, t
	var opts = {}
	for(i = 0; i < checkboxnames.length; i++){
		opts[checkboxnames[i]] =
			document.getElementById(checkboxnames[i]).checked
	}
	opts["options-url-include"] = urlRules["inc"]
	opts["options-url-exclude"] = urlRules["exc"]
	opts["options-downloadsubdir"] =
		document.getElementById("options-downloadsubdir").value
	chrome.storage.local.set(opts)
	//  Put downloadsubdir into a store that is accessed with a synchronous API so
	//  that it can be read by the chrome.downloads.onDeterminingFilename listener
	localStorage.setItem("downloadsubdir", opts["options-downloadsubdir"])
	/* Display saved status for short period */
	document.getElementById("options-save-status").style.setProperty(
		"visibility", "visible", "")
	setTimeout(function(){
		document.getElementById("options-save-status").style.setProperty(
			"visibility", "hidden", "")
	}, 1000)
}
