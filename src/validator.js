// Get required modules
var Rules = require('./rules');
var Lang = require('./lang');
var Errors = require('./errors');
var AsyncResolvers = require('./async');

function langs() {
	require('./lang/en');
	require('./lang/ru');
}

var Validator = function(input, rules, customMessages) {
	var lang = Validator.getDefaultLang();
	this.input = input;

	this.messages = Lang._make(lang);
	this.messages._setCustom(customMessages);
	
	this.errors = new Errors();
	this.errorCount = 0;
	
	this.hasAsync = false;
	this.rules = this._parseRules(rules);
};

Validator.prototype = {

	constructor: Validator,

	/**
	 * Default language
	 *
	 * @type {string}
	 */
	lang: 'en',

	/**
	 * Numeric based rules
	 *
	 * @type {array}
	 */
	numericRules: ['integer', 'numeric', 'between'],

	/**
	 * Run validator
	 *
	 * @return {boolean} Whether it passes; true = passes, false = fails
	 */
	check: function() {
		var self = this;

		for (var attribute in this.rules) {
			var attributeRules = this.rules[attribute];
			var inputValue = this.input[attribute]; // if it doesnt exist in input, it will be undefined

			for (var i = 0, len = attributeRules.length, rule, ruleOptions; i < len; i++) {
				ruleOptions = attributeRules[i];
				rule = this.getRule(ruleOptions.name);

				if (!this._isValidatable(rule, inputValue)) {
					continue;
				}
				
				if (!rule.validate(inputValue, ruleOptions.value, attribute)) {
					this._addFailure(rule);
				}
			}
		}

		return this.errorCount === 0;
	},

	/**
	 * Run async validator
	 *
	 * @param {function} passes
	 * @param {function} fails
	 * @return {void}
	 */
	checkAsync: function(passes, fails) {
		var _this = this;

		var failsOne = function(rule, message) {
			_this._addFailure(rule, message);
		};

		var resolvedAll = function(allPassed) {
			if (allPassed) {
				passes();
			}
			else {
				fails();
			}
		};

		var validateRule = function(inputValue, ruleOptions, attribute, rule) {
			return function() {
				var resolverIndex = asyncResolvers.add(rule);
				rule.validate(inputValue, ruleOptions.value, attribute, function() { asyncResolvers.resolve(resolverIndex); });
			};
		};

		var asyncResolvers = new AsyncResolvers(failsOne, resolvedAll);

		for (var attribute in this.rules) {
			var attributeRules = this.rules[attribute];
			var inputValue = this.input[attribute]; // if it doesnt exist in input, it will be undefined

			for (var i = 0, len = attributeRules.length, rule, ruleOptions; i < len; i++) {
				ruleOptions = attributeRules[i];

				rule = this.getRule(ruleOptions.name);

				if (!this._isValidatable(rule, inputValue)) {
					continue;
				}

				validateRule(inputValue, ruleOptions, attribute, rule)();
			}
		}

		asyncResolvers.enableFiring();
		asyncResolvers.fire();
	},

	/**
	 * Add failure and error message for given rule
	 *
	 * @param {Rule} rule
	 */
	_addFailure: function(rule) {
		var msg = this.messages.render(rule);	
		this.errors.add(rule.attribute, msg);
		this.errorCount++;
	},

	/**
	 * Parse rules, normalizing format into: { attribute: [{ name: 'age', value: 3 }] }
	 *
	 * @param  {object} rules
	 * @return {object}
	 */
	_parseRules: function(rules) {
		var parsedRules = {};
		for (var attribute in rules) {
			var rulesArray = rules[attribute];
			var attributeRules = [];

			if (typeof rulesArray === 'string') {
				rulesArray = rulesArray.split('|');
			}
			
			for (var i = 0, len = rulesArray.length, rule; i < len; i++) {
				rule = this._extractRuleAndRuleValue(rulesArray[i]);
				if (Rules.isAsync(rule.name)) {
					this.hasAsync = true;
				}
				attributeRules.push(rule);
			}

			parsedRules[attribute] = attributeRules;
		}
		return parsedRules;
	},

	/**
	 * Extract a rule and a value from a ruleString (i.e. min:3), rule = min, value = 3
	 * 
	 * @param  {string} ruleString min:3
	 * @return {object} object containing the name of the rule and value
	 */
	_extractRuleAndRuleValue: function(ruleString) {
		var rule = {}, ruleArray;

		rule.name = ruleString;

		if (ruleString.indexOf(':') >= 0) {
			ruleArray = ruleString.split(':');
			rule.name = ruleArray[0];
			rule.value = ruleArray.slice(1).join(":");
		}

		return rule;
	},

	/**
	 * Determine if attribute has any of the given rules
	 *
	 * @param  {string}  attribute
	 * @param  {array}   findRules
	 * @return {boolean}
	 */
	_hasRule: function(attribute, findRules) {
		var rules = this.rules[attribute] || [];
		for (var i = 0, len = rules.length; i < len; i++) {
			if (findRules.indexOf(rules[i].name) > -1) {
				return true;
			}
		}
		return false;
	},

	/**
	 * Determine if attribute has any numeric-based rules.
	 *
	 * @param  {string}  attribute
	 * @return {Boolean}
	 */
	_hasNumericRule: function(attribute) {
		return this._hasRule(attribute, this.numericRules);
	},

	/**
	 * Determine if rule is validatable
	 *
	 * @param  {Rule}   rule
	 * @param  {mixed}  value
	 * @return {boolean} 
	 */
	_isValidatable: function(rule, value) {
		if (Rules.isImplicit(rule.name)) {
			return true;
		}

		return this.getRule('required').validate(value);
	},

	/**
	 * Set custom attribute names.
	 *
	 * @param {object} attributes
	 * @return {void}
	 */
	setAttributeNames: function(attributes) {
		this.messages._setAttributeNames(attributes);
	},

	/**
	 * Get validation rule
	 *
	 * @param  {string} name
	 * @return {Rule}
	 */
	getRule: function(name) {
		return Rules.make(name, this);
	},

	/**
	 * Determine if validation passes
	 *
	 * @param {function} passes
	 * @return {boolean|undefined}
	 */
	passes: function(passes) {
		var async = this._checkAsync('passes', passes);
		if (async) {
			return this.checkAsync(passes);
		}
		return this.check();
	},

	/**
	 * Determine if validation fails
	 *
	 * @param {function} fails
	 * @return {boolean|undefined}
	 */
	fails: function(fails) {
		var async = this._checkAsync('fails', fails);
		if (async) {
			return this.checkAsync(undefined, fails);
		}
		return !this.check();
	},

	/**
	 * Check if validation should be called asynchronously
	 *
 	 * @param  {string}   funcName Name of the caller
	 * @param  {function} callback
	 * @return {boolean}
	 */
	_checkAsync: function(funcName, callback) {
		var hasCallback = typeof callback === 'function';
		if (this.hasAsync && !hasCallback) {
			throw funcName + ' expects a callback when async rules are being tested.';
		}

		return this.hasAsync || hasCallback;
	}

};

/**
 * Set messages for language
 *
 * @param {string} lang
 * @param {object} messages
 * @return {this}
 */
Validator.setMessages = function(lang, messages) {
	Lang._set(lang, messages);
	return this;
};

/**
 * Get messages for given language
 *
 * @param  {string} lang
 * @return {Messages}
 */
Validator.getMessages = function(lang) {
	return Lang._get(lang);
};

/**
 * Set default language to use
 *
 * @param {string} lang
 * @return {void}
 */
Validator.useLang = function(lang) {
	this.prototype.lang = lang;
};

/**
 * Get default language
 *
 * @return {string}
 */
Validator.getDefaultLang = function() {
	return this.prototype.lang;
};

/**
 * Register custom validation rule
 *
 * @param  {string}   name
 * @param  {function} fn
 * @param  {string}   message
 * @param  {boolean}  isImplicit
 * @return {void}
 */
Validator.register = function(name, fn, message, isImplicit) {
	var lang = Validator.getDefaultLang();
	Rules.register(name, fn, isImplicit);
	Lang._setRuleMessage(lang, name, message);
};

/**
 * Register asynchronous validation rule
 *
 * @param  {string}   name
 * @param  {function} fn
 * @param  {string}   message
 * @return {void}
 */
Validator.registerAsync = function(name, fn, message) {
	var lang = Validator.getDefaultLang();
	Rules.registerAsync(name, fn);
	Lang._setRuleMessage(lang, name, message);
};

/**
 * Make validator
 *
 * @param  {object} input
 * @param  {object} rules
 * @param  {object} customMessages
 * @return {Validator}
 */
Validator.make = function(input, rules, customMessages) {
	return new Validator(input, rules, customMessages);
};

module.exports = Validator;