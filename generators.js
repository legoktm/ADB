/**
 * blah blah blah
 * @author Legoktm
 */

/*

 Queue.js

 A function to represent a queue

 Created by Stephen Morley - http://code.stephenmorley.org/ - and released under
 the terms of the CC0 1.0 Universal legal code:

 http://creativecommons.org/publicdomain/zero/1.0/legalcode

 */

/* Creates a new queue. A queue is a first-in-first-out (FIFO) data structure -
 * items are added to the end of the queue and removed from the front.
 */
function Queue(){

	// initialise the queue and offset
	var queue  = [];
	var offset = 0;

	/* Returns the length of the queue.
	 */
	this.getLength = function(){

		// return the length of the queue
		return (queue.length - offset);

	}

	/* Returns true if the queue is empty, and false otherwise.
	 */
	this.isEmpty = function(){

		// return whether the queue is empty
		return (queue.length == 0);

	}

	/* Enqueues the specified item. The parameter is:
	 *
	 * item - the item to enqueue
	 */
	this.enqueue = function(item){

		// enqueue the item
		queue.push(item);

	}

	/* Dequeues an item and returns it. If the queue is empty then undefined is
	 * returned.
	 */
	this.dequeue = function(){

		// if the queue is empty, return undefined
		if (queue.length == 0) return undefined;

		// store the item at the front of the queue
		var item = queue[offset];

		// increment the offset and remove the free space if necessary
		if (++ offset * 2 >= queue.length){
			queue  = queue.slice(offset);
			offset = 0;
		}

		// return the dequeued item
		return item;

	}

	/* Returns the item at the front of the queue (without dequeuing it). If the
	 * queue is empty then undefined is returned.
	 */
	this.peek = function(){

		// return the item at the front of the queue
		return (queue.length > 0 ? queue[offset] : undefined);

	}

}


(function ($, mw) {

	mw.util.addCSS( '.gen-form { display: block; }' );


	mw.loader.load(['jquery.chosen', 'jquery.ui.autocomplete']);

	// Race condition?
	mw.config.queue = new Queue();

	mw.config.namespaces = {};

	$('#main').prepend($('There are currently <div id="lgcount">0</div> items in the queue.'));
	
	function enqueue(item) {
		mw.config.queue.enqueue(item);
		$('#lgcount').text(mw.config.queue.getLength());
	}

	function dequeue() {
		var i = mw.config.queue.dequeue();
		$('#lgcount').text(mw.config.queue.getLength());
		return i;
	}

	/**
	 * Provide autocomplete suggestions
	 * @param query string search term
	 * @param type string one of item, property, query
	 * @param callback
	 */
	function autocomplete_suggestions( query, type, callback ) {
		var api = new mw.Api();
		api.get({
			action: 'wbsearchentities',
			search: query,
			language: mw.config.get('wgUserLanguage'),
			type: type,
			limit: 10
		}).done( function( data ) {
				console.log('done!');
				var arr = [];
				$.each( data.search, function( index, value ) {
					arr.push({
						label: value.label + ' (' + value.description + ')',
						value: value.id
					});
				});
				callback( arr );
			}).fail( function( error) {
				console.log(error);
				console.log(':(');
				callback( [] );
			});
	}



	function remote_autocomplete( query, callback ) {
		var params = {
			action: 'opensearch',
			search: query,
			suggest: ''
		};
		$.getJSON( location.protocol + '//' + mw.config.ADB['default-site'] + '/w/api.php?' + $.param(params) + '&callback=?',
			function ( data ) {
				callback( data[1] );
			}
		);
	}

	function log_event(id, text) {
		var thing = $('#' + id);
		if ( thing.length > 0 ) {
			var old = $(id).text();
			thing.text( old + '; ' + text );
			// Bump back to the top
			thing.remove();
			$('#logging').prepend(thing);
		} else {
			$('#logging').prepend('<li id="' + id + '">'+text+'</li>');
		}
	}

	function get_list_using_property( pid, callback, cont ) {
		var api = new mw.Api();
		var params = {
			action: 'query',
			list: 'backlinks',
			bltitle: 'Property:' + pid,
			bllimit: '50',
			blnamespace: '0'
		};
		if ( cont !== undefined ) {
			params.blcontinue = cont;
		}
		api.get( params ).done( function ( data ) {
			if ( data['query-continue'] !== undefined ) {
				get_list_using_property( pid, callback, data['query-continue'].backlinks.blcontinue );
			}
			var arr = [];
			$.each( data.query.backlinks, function( index, value ) {
				arr.push(value.title);
			});
			callback( arr );

		} );

	}


	/**
	 * Get the content of each entity
	 * @param items array of qids
	 * @param callback each entity will be called independently
	 */
	function populate_items( items, callback ) {
		var entities = '';
		console.log('each items-populate_items');
		$.each( items, function ( index, value ) {
			entities +=  value + '|';
		} );
		var api = new mw.Api();
		api.get({
			action: 'wbgetentities',
			ids: entities.slice(0,-1)  // Kill the last |
		}).done( function ( data ) {
				$.each( data.entities, function ( qid, entitydata ) {
					callback( entitydata );
				});
			});
	}

	/**
	 * Check whether the claim we want to add is a dupe
	 *
	 * @param entitydata
	 * @param pid
	 * @param dataValue
	 * @return bool
	 */
	function check_doesnt_have_claim( entitydata, pid, dataValue ) {
		if ( entitydata.claims === undefined ) {
			return true;
		}
		if ( entitydata.claims[pid] === undefined) {
			return true;
		}
		var ok = true;
		$.each( entitydata.claims[pid], function( index, value ) {
			console.log(JSON.stringify(value.mainsnak.datavalue.value));
			console.log(dataValue);
			if ( JSON.stringify(value.mainsnak.datavalue.value) == dataValue ) {
				console.log([JSON.stringify(value.mainsnak.datavalue.value), dataValue, 'true']);
				ok = false;
			} else {
				console.log([JSON.stringify(value.mainsnak.datavalue.value), dataValue, 'false']);
			}
		});
		console.log('returning: ' + ok );
		return ok;
	}

	/**
	 * Populates items from a category. Will automatically call
	 * populate_items.
	 */
	function category_generator( site, catname, ignoreprefix, callback, cont ) {
		console.log('fetching cat');
		// action=query&generator=allpages&prop=pageprops&continue=&format=jsonfm
		var params = {
			action: 'query',
			generator: 'categorymembers',
			gcmtitle: catname,
			gcmlimit: 50,
			gcmnamespace: 0,
			prop: 'pageprops',
			format: 'json'
		};
		if ( cont !== undefined ) {
			params.gcmcontinue = cont;
		}
		$.getJSON( location.protocol + '//' + site + '/w/api.php?' + $.param(params) + '&callback=?',
			function ( data ) {
				if ( data['query-continue'] !== undefined ) {
					category_generator( site, catname, ignoreprefix, callback, data['query-continue'].categorymembers.gcmcontinue );
				}
				var arr = [];
				$.each( data.query.pages, function ( pageid, value ) {
					if ( value.pageprops !== undefined ) {
						if ( value.pageprops['wikibase_item'] !== undefined ) {
							var ok = true;
							if ( ignoreprefix ) {
								$.each( ignoreprefix.split(','), function( index, val ) {
									if ( value.title.lastIndexOf(val, 0) === 0 ) {
										ok = false;
									}
								});
							}
							if ( ok ) {
								arr.push( value.pageprops['wikibase_item'] );
							}
						}
					}
				});
				if ( arr.length != 0 ) {
					populate_items( arr, callback );
				}
			});
	}

	function get_namespaces( site ) {
		// We store stuff in the mw.config global
		if ( mw.config.namespaces[site] !== undefined ) {
			return;
		}
		// action=query&meta=siteinfo&siprop=namespaces&format=jsonfm
		var params = {
			action: 'query',
			meta: 'siteinfo',
			siprop: 'namespaces',
			format: 'json'
		};
		$.getJSON( location.protocol + '//' + site + '/w/api.php?' + $.param(params) + '&callback=?',
			function (data) {
				mw.config.namespaces[site] = data.query.namespaces;
		});
	}

	var allowed_generators = {
		backlinks: 'backlinks (Special:Whatlinkshere)',
		categorymembers: 'Members of a category',
		embeddedin: 'Template usage',
		imageusage: 'File usage',
		exturlusage: 'External link usage'
	};


	function preload_generator() {
		// Store some stuff in mw.config!
		if ( mw.config.generators !== undefined ) {
			return;
		}
		var mods = '';
		$.each( allowed_generators, function( key, value ) {
			mods += key + '|';
		});
		get_namespaces(mw.config.ADB['default-site']); // Will be done in the background
		var api = new mw.Api();
		api.get({
			action: 'paraminfo',
			querymodules: mods.slice(0, -1)
		}).done( function( data ) {
				mw.config.generators = data;
			});
		}

	function require_pref( name, help, example ) {
		if ( mw.config.ADB[name] === undefined ) {
			var ans = window.prompt(help, example);
			if ( ans === '' ) {
				ans = example;
			}
			mw.config.ADB[name] = ans;
			save_prefs();
		}
	}

	function load_prefs( callback ) {
		if ( mw.config.ADB !== undefined ) {
			return;
		}
		var api = new mw.Api();
		api.get({
			action: 'query',
			titles: 'User:' + mw.config.get('wgUserName') + '/ADB-prefs.js',
			prop: 'revisions',
			rvprop: 'content',
			indexpageids: ''
		}).done( function ( data ) {
				var pageid = data.query.pageids[0];
				if ( pageid === '-1' ) {
					mw.config.ADB = {};
				} else {
					console.log(data);
					var content = data.query.pages[pageid].revisions[0]['*'];
					console.log(content);
					mw.config.ADB = JSON.parse(content);
				}

				callback();
			});
	}

	function save_prefs() {
		// Prefs stored in mw.config.ADB
		if ( mw.config.ADB === undefined ) {
			mw.config.ADB = {};
		}
		mw.config.ADB.version = '0.1';
		var api = new mw.Api();
		api.post({
			action: 'edit',
			title: 'User:' + mw.config.get('wgUserName') + '/ADB-prefs.js',
			text: JSON.stringify(mw.config.ADB),
			token: mw.user.tokens.get('editToken')
		});
	}

	// TODO this should work if we use www.wikidata.org as our site
	function make_generator_request( params, callback ) {
		var url = location.protocol + '//' + mw.config.ADB['default-site'] + '/w/api.php?';
		url += $.param(params);
		url += '&callback=?';
		$.getJSON(url, function ( data ) {
			if ( data['query-continue'] !== undefined ) {
				var newparams = $.extend({}, params, data['query-continue'][params.generator]);
				make_generator_request( params, callback );
			}
			var arr = [];
			$.each( data.query.pages, function ( pageid, value ) {
				if ( value.pageprops !== undefined ) {
					if ( value.pageprops['wikibase_item'] !== undefined ) {
						arr.push( value.pageprops['wikibase_item'] );
					}
				}
			});
			if ( arr.length != 0 ) {
				populate_items( arr, callback );
			}
		});
	}

	function set_up_submit_handler() {
		$('.gen-form').submit( function (e) {
			e.preventDefault();
			var realthis = this;
			var list = $(realthis).find('[name=list]').val();
			var params = {
				action: 'query',
				generator: list
			};
			$.each( mw.config.generators.paraminfo.querymodules, function( index, value ) {
				if ( value.name !== list ) {
					return;
				}
				$.each( value.parameters, function( i, v ) {
					var vval = $(realthis).find('[name=' + v.name + ']').val();
					if ($.isArray( vval )) {
						var s = '';
						$.each( vval, function ( index, value ) {
							s +=  value + '|';
						} );
						s = s.slice(0, -1);
						params['g' + v.name] = s;
					} else if ( vval !== '' && vval !== undefined && vval !== null ) {
						params['g' + v.name] = vval;
					}
				});
			});
			console.log(params);
		});
	}

	function pick_a_generator() {
	// action=paraminfo&querymodules=backlinks|categorymembers&format=jsonfm
		console.log('start');
		var gen = $('#generator');
		gen.text('');
		var formthingies = [
			{
				'data-placeholder': 'Select a generator...',
				'class': 'chosen-select',
				id: 'gentype',
				style: 'width:350',
				htmltype: 'select',
				options: allowed_generators
			}
		];
		gen.append(make_form( formthingies ));

		mw.loader.using( 'jquery.chosen', function () {
			console.log('using chosen!');
			$('.chosen-select').chosen();
		});

		$('#gentype').on('change', function () {
			$('.gen-form').hide();
			$('#' + $(this).val() + '-form').show();
			mw.loader.using( 'jquery.chosen', function () {
				$('.chosen-select').chosen();
			});
			set_up_submit_handler();
		});

		$.each( mw.config.generators.paraminfo.querymodules, function( index, value ) {
			var arr = [
				{
					name: 'prefix',
					type: 'hidden',
					value: value.prefix
				},
				{
					name: 'list',
					type: 'hidden',
					value: value.name
				},
				{
					name: 'gogogo',
					type: 'submit',
					value: 'Start!'
				}
			];
			$.each( value.parameters, function( i, val ) {
				if ( val.name === 'continue' || val.name === 'prop' ) {
					return;
				}
				var thingy = {
					name: val.name,
					placeholder: val.description,
					//class: value.name + '-form gen-form'
				};
				if ( val.name === 'title' ) {
					thingy['class'] += ' remote-autocomplete';
				}
				if ( val.type === 'string' ) {
					thingy.style = 'width:70%';
				} else if ( $.isArray(val.type) ) {
					thingy['data-placeholder'] = 'Select an option';
					thingy.help = val.description;
					thingy.options = val.type;
					thingy.htmltype = 'select';
					thingy['class'] += ' chosen-select';
				} else if ( val.type === 'namespace' ) {
					var ns = {};
					$.each(mw.config.namespaces[mw.config.ADB['default-site']], function( nsid, nsinfo ) {
						if ( nsinfo['*'] === '' ) {
							nsinfo['*'] = 'Mainspace';
						}
						ns[nsid] = nsinfo['*'];
					});
					thingy['data-placeholder'] = 'Select a namespace';
					thingy.help = val.description;
					thingy.htmltype = 'select';
					thingy.multiple = true;
					thingy['class'] += ' chosen-select';
					thingy.options = ns;
					thingy.style = 'width: 350px';
				} else {
					return;
				}
				arr.push(thingy);
			});
			var div = $('<div></div>').attr('id', value.name + '-form').attr('class', 'gen-form');
			//arr = arr.concat(make_action_form2());
			div.html(make_form( arr ));
			$('#generator').append( div );
			$('#' + value.name + '-form').hide();
			mw.loader.using( 'jquery.chosen', function () {
				$('.chosen-select').chosen();
			});

			mw.loader.using('jquery.ui.autocomplete', function() {
				$('.remote-autocomplete').autocomplete({
					source: function( request, response ) {
						remote_autocomplete( request.term, response );
					}
				});
			});
		});
		var ffform = make_form(make_action_form2(), {id: 'thingy'}, true );
		var seconddiv = $('<div></div>').attr('id', 'submit-button-div').append(ffform);
		$.each( get_available_actions(), function( name, info ) {
			seconddiv.append(info.form);
		});
		gen.append(seconddiv);
		enable_wb_autocomplete();
		$('.action-form').hide();
		$('#action-chooser').on('change', function () {
			$('.action-form').hide();
			$('#' + $(this).val() + '-form').show();
			mw.loader.using( 'jquery.chosen', function () {
				$('.chosen-select').chosen();
			});
		});



	}

	/**
	 * Action specification
	 * Each action should take a first parameter which is a generator
	 */

	function get_available_actions() {
		var actions = {};
		actions['add-claims'] = {
			name: 'add-claims',
			form: add_claims(),
			action: function ( vars ) { console.log(vars);}
		};
		actions['sleep'] = {
			name: 'sleep',
			form: '',
			action: function ( vars ) { mw.notify('Sleeeep');}
		};
		if ( inGroup( 'sysop' ) ) {
			actions['remove-claims'] = {
				name: 'remove-claims',
				form: remove_claims(),
				action: function ( vars ) { console.log(vars);}
			};
		}
		return actions;
	}

	function add_claim( pid, dataValue, editSummary, entity ) {
		var api = new mw.Api();
		console.log(editSummary);
		api.post({
			action: 'wbcreateclaim',
			entity: entity,
			snaktype: 'value',
			property: pid,
			bot: '1',
			summary: editSummary,
			value: dataValue,
			token: mw.user.tokens.get('editToken')
		}).done( function( data ) {
				var revid = data.pageinfo.lastrevid;
				var difflink = make_link( '?diff=' + revid, true, 'Added' );
				log_event(entity, difflink + ' claim to ' + make_link(entity) );
			});
	}

	function make_link( title, dontencode, text ) {
		var encoded = !dontencode ? encodeURIComponent(title) : title;
		text = text ? text : title;
		return '<a href="//www.wikidata.org/wiki/'+encoded+'">' + text + '</a>';
	}

	function remove_claim( pid, editSummary, entitydata ) {
		if ( entitydata.claims !== undefined ) {
			var ourclaims = entitydata.claims[pid];
			if ( ourclaims !== undefined ) {
				var removeclaims = '';
				$.each( ourclaims, function( index, value ) {
					removeclaims += value.id + '|';
				});

				var api = new mw.Api();
				api.post({
					action: 'wbremoveclaims',
					token: mw.user.tokens.get('editToken'),
					bot: '1',
					summary: editSummary,
					claim: removeclaims.slice(0,-1) // Kill the last |
				});
			}
		}
	}

	/**
	 * Wrapper around populate_items to get a properties datatype
	 * @todo cache this
	 * @param pid
	 * @param callback
	 */
	function get_property_datatype( pid, callback ) {
		function cback ( entitydata ) {
			callback( entitydata.datatype );
		}
		populate_items( [pid], cback );
	}

	function makeDataValue( datatype, value, callback ) {
		var dataValue;
		switch ( datatype ) {
			case 'wikibase-item':
				dataValue = {
					'entity-type': 'item',
					'numeric-id': parseInt(value.slice(1))
				};
				break;
			default:
				dataValue = value;
		}
		dataValue = JSON.stringify( dataValue );
		console.log('made datavalue');
		callback( dataValue );
	}

	function make_action_form2( ) {
		var options = {
			'add-claims': 'Add claims',
			'generator': 'Generator',
			'sleep': 'Sleep'
		};
		if ( inGroup( 'sysop' ) ) {
			options['remove-claims'] = 'Remove claims';
		}
		return [
			{
				name: 'action',
				htmltype: 'select',
				'data-placeholder': 'Select an action',
				'class': 'chosen-select',
				options: options,
				style: 'width:350',
				help: 'Pick an action',
				id: 'action-chooser'
			},
			/*{
				name: 'gogogo',
				type: 'submit',
				value: 'Start!'
			}*/
		];
		//$('#start').append(make_form(thingies, {id: 'action-form'}));


		// dunno why this doesnt work
		/*
		mw.loader.using('jquery.chosen', function() {
			$('.chosen-select').chosen();
		});
		*/

	}

	function make_action_form( ) {
		var $form = $('<form id="action-form"></form>');
		if ( inGroup( 'sysop' ) ) {
			$form.append('<input type="radio" name="action" value="remove-claims" />Remove claims<br />');
		}
		$form.append('<input type="radio" name="action" value="add-claims" />Add claims<br />');
		$form.append('<input type="radio" name="action" value="generator" />Generator<br />')
		$form.append('<input type="radio" name="action" value="sleep" />Sleep<br />');
		$form.append('<input type="submit" value="Continue" />');
		$('#start').append($form);
	}

	var formDefaults = [
		{
			name: 'pid-value',
			placeholder: 'P###',
			class: 'property-autocomplete'
		},
		{
			name: 'edit-summary',
			placeholder: 'Edit summary',
			maxlength: 240
		},
		{
			name: 'submit',
			_type: 'submit',
			value: 'Go!'
		}
	];

	/**
	 * Help make a html form
	 */
	function make_form( data, attrs, wrapindivinstead ) {
		if ( attrs === undefined ) {
			attrs = {};
		}
		var $form;
		if ( wrapindivinstead !== undefined ) {
			$form = $('<div></div>').attr(attrs);
		} else {
			$form = $('<form></form>').attr(attrs);
		}
		//$form.attr( data );
		$.each( data, function ( index, value ) {
			if ( value.id === undefined ) {
				value.id = value.name;
			}
			if ( value.type === undefined ) {
				value.type = 'text';
			}
			if ( value.help !== undefined ) {
				// http://stackoverflow.com/questions/5631384/remove-everything-after-a-certain-character
				var n = value.help.indexOf('NOTE');
				value.help = value.help.substring(0, n != -1 ? n : value.help.length);
				$form.append(value.help);
				delete value.help;
			}

			var htmltype = value.htmltype;
			delete value.htmltype;
			var input;
			if ( htmltype === 'select' ) {
				if ( value.multiple !== undefined ) {
					input = $('<select multiple></select>');
					delete value.multiple;
				} else {
					input = $('<select></select>');
				}
				input.append($('<option></option>')); // Add a null one
				if ($.isArray(value.options)) {
					$.each(value.options, function( index, val ) {
						input.append($('<option></option>').text(val));
					});

				} else {
					$.each( value.options, function( key, val ) {
						input.append($('<option></option>').text(val).attr('value', key) );
					} );
				}
				delete value.options;
				input.attr(value);
			} else {
				input = $('<input />');
				input.attr(value);
			}
			$form.append(input);
			$form.append('<br />')
		});

		return $form;
	}

	function enable_wb_autocomplete() {
		mw.loader.using( 'jquery.ui.autocomplete', function () {
			$('.item-autocomplete').autocomplete({
				source: function( request, response ) {
					autocomplete_suggestions( request.term, 'item', response );
				}
			});
			$('.property-autocomplete').autocomplete({
				source: function( request, response ) {
					autocomplete_suggestions( request.term, 'property', response );
				}
			});
		});
	}

	function add_claims() {
		var buttons = [
			{
				name: 'pid-value',
				placeholder: 'P###',
				class: 'property-autocomplete',
				help: 'Property'
			},
			{
				name: 'edit-summary',
				maxlength: 240,
				help: 'Edit summary',
				'class': 'restrict-length'
			},
			{
				name: 'qid-value',
				placeholder: 'Value',
				class: 'item-autocomplete',
				help: 'Value'
			},
			{
				name: 'action-do',
				type: 'hidden',
				value: 'add-claims'
			}
		];
		var attrs = {
			id: 'add-claims-form',
			'class': 'action-form'
		};
		return make_form( buttons, attrs, true );
		//$('#form2').append(make_form( buttons ));
	}

	function remove_claims() {
		var buttons = [
			{
				name: 'pid-value',
				placeholder: 'P###',
				class: 'property-autocomplete'
			},
			{
				name: 'edit-summary',
				placeholder: 'Edit summary',
				maxlength: 240,
				'class': 'restrict-length'
			},
			{
				name: 'action-do',
				type: 'hidden',
				value: 'remove-claims'
			}
		];
		var attrs = {
			id: 'remove-claims-form',
			'class': 'action-form'
		};
		return make_form( buttons, attrs, true );
		//$('#form2').append(make_form( buttons ));
	}

	function do_remove_claims() {
		var pid = $('#pid-value').val().toUpperCase();
		var editSummary = $('#edit-summary').val() + ') ([[User:Legoktm/ADB|ADB]]';
		var remove_claim_cb = function ( entitydata ) {
			remove_claim( pid, editSummary, entitydata );
		};
		var populate_items_cb = function( items ) {
			populate_items( items, remove_claim_cb );
		};
		get_list_using_property( pid, populate_items_cb );
	}


	function do_add_claims() {
		var pid = $('#pid-value').val().toUpperCase();
		var editSummary = $('#edit-summary').val();
		var ignore = $('#ignore-list').val();
		var value = $('#qid-value').val();
		var site = $('#gen-site').val();
		var category = $('#gen-category').val();
		get_property_datatype( pid, function( datatype ) {
			makeDataValue( datatype, value, function( dataValue ) {
				category_generator( site, category, ignore, function( entitydata ) {
					if ( check_doesnt_have_claim( entitydata, pid, dataValue ) === true ) {
						console.log('adding.......');
						add_claim( pid, dataValue, editSummary, entitydata.id );
					} else {
						console.log('skipping.....');
						log_event( entitydata.id, 'Skipped adding claim on ' + make_link(entitydata.id) );
					}

				});
			});
		});
	}

	function inGroup( group ) {
		return mw.config.get('wgUserGroups').indexOf(group) > -1;
	}

	$('#form2').submit( function (e) {
		e.preventDefault();
		var action = $('#action-do').val();
		switch ( action ) {
			case 'remove-claims':
				do_remove_claims();
				break;
			case 'add-claims':
				do_add_claims();
				break;
			default:
				mw.notify('Internal error');
		}
		return false;
	});


	$('#start').submit( function (e) {
		e.preventDefault();
		var val = $("#action-form input[type='radio']:checked").val();
		$('#action-form').hide(); // Done with that one.
		switch ( val ) {
			case 'remove-claims':
				remove_claims();
				break;
			case 'add-claims':
				$('#form2').append(add_claims());
				break;
			case 'generator':
				pick_a_generator();
				break;
			default:
				mw.notify('Gooooooodnight!');
		}
		return false;
	});

	function init() {
		load_prefs( function() {
			require_pref('default-site', 'What Wikipedia (or Wikivoyage) should we pull data from?', 'en.wikipedia.org');
			preload_generator();
		});
		make_action_form();
	}

	init();
}(jQuery, mediaWiki));
