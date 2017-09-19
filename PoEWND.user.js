// ==UserScript==
// @name         PoEWND
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  more info for your stash/inventory
// @author       Randelung
// @match        https://www.pathofexile.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

HTMLCollection.prototype.map = Array.prototype.map;
HTMLCollection.prototype.concat = Array.prototype.concat;
NodeList.prototype.map = Array.prototype.map;

const ModType = Object.freeze({
	PREFIX: Symbol("Prefix"),
	SUFFIX: Symbol("Suffix")
});

const RegEx = [];

function splitIntoRegexAndValues(response) {
	const table = response.match(/<table(?:.|\n)*<\/table>/)[0];
	const tableRoot = new DOMParser().parseFromString(table, "text/html").getElementsByTagName("tbody")[0];
	let string;
	let regex;
	let matches;
	let itemLevel;
	let modType;
	const strings = tableRoot.childNodes.map(i => i.lastChild.firstChild.innerHTML);
	for (let i = strings.length - 1; i >= 0; i -= 1) {
		if (strings[i].indexOf("<br>") > -1) {
			const splitString = strings[i].split("<br>");
			for (let j = 0; j < splitString.length; j += 1) {
				if (strings.includes(splitString[j])) {
					continue;
				}
				const tr = document.createElement("tr");
				tr.appendChild(document.createElement("td"));
				tr.appendChild(document.createElement("td"));
				tr.appendChild(document.createElement("td"));
				tr.firstChild.textContent = tableRoot.childNodes[i].firstChild.textContent;
				tr.childNodes[1].textContent = tableRoot.childNodes[i].childNodes[1].textContent;
				const span = document.createElement("span");
				span.textContent = splitString[j];
				tr.appendChild(span);
				tableRoot.appendChild(tr);
				strings.push(splitString[j]);
			}
			tableRoot.removeChild(tableRoot.childNodes[i]);
		}
	}
	for (let i = 0; i < tableRoot.childNodes.length; i += 1) {
		string = tableRoot.childNodes[i].lastChild.firstChild.textContent;
		regex = "^" + string.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&").replace(/\\\(.*?\\\)/g, "(.*)") + "$";
		itemLevel = parseInt(tableRoot.childNodes[i].firstChild.textContent);
		modType = tableRoot.childNodes[i].childNodes[1].textContent === "Prefix" ? ModType.PREFIX : ModType.SUFFIX;
		if (!(regex in RegEx)) {
			RegEx[regex] = [true, modType];
		}
		matches = string.match(/\((.*)–(.*)\).*\((.*)–(.*)\)/);
		if (matches) {
			matches = [parseFloat(matches[1]), parseFloat(matches[2]), parseFloat(matches[3]), parseFloat(matches[4])];
			RegEx[regex].push({
				MIN1: matches[0],
				MAX1: matches[1],
				MIN2: matches[2],
				MAX2: matches[3],
				LEVEL: itemLevel
			});
			continue;
		}
		matches = string.match(/\((.*)–(.*)\)/);
		if (matches) {
			matches = [parseFloat(matches[1]), parseFloat(matches[2])];
			RegEx[regex].push({
				MIN1: matches[0],
				MAX1: matches[1],
				LEVEL: itemLevel
			});
			continue;
		}
		RegEx[regex][0] = false;
	}
}

const Rarity = Object.freeze({
	GEM: Symbol("gem"),
	NORMAL: Symbol("normal"),
	MAGIC: Symbol("magic"),
	RARE: Symbol("rare"),
	UNIQUE: Symbol("unique")
});

class Item {
	constructor(boxElement) {
		this.boxElement = boxElement;
		this.ratings = [];
		if (boxElement.classList.contains("gemPopup")) {
			this.typeName = boxElement.getElementsByClassName("itemName typeLine")[0].innerText.trim();
			this.rarity = Rarity.GEM;
		} else if (boxElement.classList.contains("normalPopup")) {
			this.typeName = boxElement.getElementsByClassName("itemName typeLine")[0].innerText.trim();
			this.rarity = Rarity.NORMAL;
			this.rateNonUniqueItem();
		} else if (boxElement.classList.contains("magicPopup")) {
			this.typeName = boxElement.getElementsByClassName("itemName typeLine")[0].innerText.trim();
			this.rarity = Rarity.MAGIC;
			this.rateNonUniqueItem();
		} else if (boxElement.classList.contains("rarePopup")) {
			this.typeName = boxElement.getElementsByClassName("itemName typeLine")[0].innerText.trim();
			this.rarity = Rarity.RARE;
			this.rateNonUniqueItem();
		} else if (boxElement.classList.contains("uniquePopup")) {
			this.typeName = boxElement.getElementsByClassName("itemName typeLine")[0].innerText.trim();
			this.uniqueName = boxElement.getElementsByClassName("itemName")[0].innerText.trim();
			this.rarity = Rarity.UNIQUE;
		} else throw "Unrecognized element";
	}

	rateNonUniqueItem() {
		const implicitModContainer = this.boxElement.getElementsByClassName("implicitMod");
		const implicitMod = implicitModContainer.length === 0 ? undefined : implicitModContainer[0].innerText.trim();
		if (implicitMod) {
			outerLoop:
				for (let key in RegEx) {
					if (implicitMod.match(key)) {
						console.debug("Found implicit mod on item " + this.typeName + ": " + key + " " + RegEx[key][1].toString().substring(6));
						if (!RegEx[key][0]) {
							break;
						}
						const match = implicitMod.match(key);
						if (match.length === 2) {
							for (let j = 2; j < RegEx[key].length; j += 1) {
								if (match[1] >= RegEx[key][j].MIN1 && match[1] <= RegEx[key][j].MAX1) {
									const rating = (match[1] - RegEx[key][j].MIN1) / (RegEx[key][j].MAX1 - RegEx[key][j].MIN1);
									this.ratings.push(rating);
									this.boxElement.getElementsByClassName("implicitMod")[0].firstChild.textContent += " (" + Math.round(100 * rating) + "%)";
									break outerLoop;
								}
							}
						} else if (match.length === 3) {
							for (let j = 2; j < RegEx[key].length; j += 1) {
								if (match[1] >= RegEx[key][j].MIN1 && match[1] <= RegEx[key][j].MAX1 && match[2] >= RegEx[key][j].MIN2 && match[2] <= RegEx[key][j].MAX2) {
									const rating = ((match[1] - RegEx[key][j].MIN1) / (RegEx[key][j].MAX1 - RegEx[key][j].MIN1) +
										(match[2] - RegEx[key][j].MIN2) / (RegEx[key][j].MAX2 - RegEx[key][j].MIN2)) / 2;
									this.ratings.push(rating);
									this.boxElement.getElementsByClassName("implicitMod")[0].firstChild.textContent += " (" + Math.round(100 * rating) + "%)";
									break outerLoop;
								}
							}
						}
						console.warn("Invalid match for " + implicitMod + " and " + key + " on " + this.typeName);
						break;
					}
				}
		}
		const explicitMods = this.boxElement.getElementsByClassName("explicitMod").map(i => i.innerText.trim());
		outerLoop:
			for (let i = 0; i < explicitMods.length; i += 1) {
				for (let key in RegEx) {
					if (explicitMods[i].match(key)) {
						console.debug("Found explicit mod on item " + this.typeName + ": " + key + " " + RegEx[key][1].toString().substring(6));
						this.boxElement.getElementsByClassName("explicitMod")[i].firstChild.textContent += " " + RegEx[key][1].toString().substring(6);
						if (!RegEx[key][0]) {
							continue outerLoop;
						}
						const match = explicitMods[i].match(key);
						if (match.length === 2) {
							for (let j = 2; j < RegEx[key].length; j += 1) {
								if (match[1] >= RegEx[key][j].MIN1 && match[1] <= RegEx[key][j].MAX1) {
									const rating = (match[1] - RegEx[key][j].MIN1) / (RegEx[key][j].MAX1 - RegEx[key][j].MIN1);
									this.ratings.push(rating);
									this.boxElement.getElementsByClassName("explicitMod")[i].firstChild.textContent += " (" + Math.round(100 * rating) + "%)";
									continue outerLoop;
								}
							}
						} else if (match.length === 3) {
							for (let j = 2; j < RegEx[key].length; j += 1) {
								if (match[1] >= RegEx[key][j].MIN1 && match[1] <= RegEx[key][j].MAX1 && match[2] >= RegEx[key][j].MIN2 && match[2] <= RegEx[key][j].MAX2) {
									const rating = ((match[1] - RegEx[key][j].MIN1) / (RegEx[key][j].MAX1 - RegEx[key][j].MIN1) +
										(match[2] - RegEx[key][j].MIN2) / (RegEx[key][j].MAX2 - RegEx[key][j].MIN2)) / 2;
									this.ratings.push(rating);
									this.boxElement.getElementsByClassName("explicitMod")[i].firstChild.textContent += " (" + Math.round(100 * rating) + "%)";
									continue outerLoop;
								}
							}
						}
						console.warn("Invalid match for " + explicitMods[i] + " and " + key + " on " + this.typeName);
						continue outerLoop;
					}
				}
				console.warn("Unable to find match for " + explicitMods[i] + " on " + this.typeName);
			}
		if (this.ratings.length > 0) {
			this.boxElement.getElementsByClassName("itemName")[0].childNodes[1].textContent += " (" + Math.round(100 * this.ratings.reduce((a, b) => a + b) / this.ratings.length) + "%)";
		}
	}
}

function loadData() {
	const normalItems = document.getElementsByClassName("normalPopup");
	const magicItems = document.getElementsByClassName("magicPopup");
	const rareItems = document.getElementsByClassName("rarePopup");
	const uniqueItems = document.getElementsByClassName("uniquePopup");
	const gemItems = document.getElementsByClassName("gemPopup");
	const allItems = [];
	Array.prototype.push.apply(allItems, normalItems);
	Array.prototype.push.apply(allItems, magicItems);
	Array.prototype.push.apply(allItems, rareItems);
	Array.prototype.push.apply(allItems, uniqueItems);
	Array.prototype.push.apply(allItems, gemItems);
	allItems.map(i => new Item(i));
}

const button = document.createElement("button");
button.innerHTML = "Rate items";
button.style = "position: fixed; right: 2em; top: 2em; z-index: 1000000;";
button.onclick = loadData;
document.body.appendChild(button);

GM_xmlhttpRequest({
	method: "GET",
	url: "http://poedb.tw/us/mod.php",
	onreadystatechange: function (response) {
		if (response.readyState !== 4 || response.status !== 200) {
			return;
		}
		splitIntoRegexAndValues(response.responseText);
	}
});
