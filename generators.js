/**
 * blah blah blah
 * @author Legoktm
 */


(function ($, mw) {


    mw.loader.load(['jquery.chosen', 'jquery.ui.autocomplete']);
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

    function log_event(id, text) {
        var thing = $('#' + id);
        if ( thing.length > 0 ) {
            var old = $(id).text();
            thing.text( old + '; ' + text );
        } else {
            $('#logging').prepend('<li id=""' + id + '">'+text+'</li>');
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

    function pick_a_generator() {
        $('#generator').text('Loading...');
        var allowed = {
            backlinks: 'backlinks (Special:Whatlinkshere)',
            categorymembers: 'Members of a category',
            embeddedin: 'Template usage',
            imageusage: 'File usage'
        };
        // action=paraminfo&querymodules=backlinks|categorymembers&format=jsonfm
        var mods = '';
        $.each( allowed, function( key, value ) {
            mods += key + '|';
        });
        var api = new mw.Api();
        api.get({
            action: 'paraminfo',
            querymodules: mods.slice(0, -1)
        }).done( function ( data ) {
                console.log('start');
                var gen = $('#generator');
                gen.text('');
                var $form = $('<form></form>');
                var $select = $('<select></select>');
                console.log('pre-attr');
                $select.attr({
                    'data-placeholder': 'Select a generator...',
                    class: 'chosen-select',
                    id: 'gentype',
                    style: 'width:350'
                });
                console.log(allowed);
                $.each( allowed, function( key, value ) {
                    console.log([key, value]);
                    var opt = $('<option></option>');
                    opt.text(value);
                    opt.attr('value', key);
                    $select.append(opt);
                });
                console.log('post $.each');
                $form.append($select);
                gen.append($form);

                mw.loader.using( 'jquery.chosen', function () {
                    console.log('using chosen!');
                    $('.chosen-select').chosen();
                });

                $('#gentype').on('change', function () {
                    $('.gen-form').hide();
                    $('#' + $(this).val() + '-form').show();
                });

                $.each( data.paraminfo.querymodules, function( index, value ) {
                    var arr = [
                        {
                            name: 'prefix',
                            type: 'hidden',
                            value: value.prefix
                        },
                    ];

                    $.each( value.parameters, function( i, val ) {
                        if ( val.type === 'string' && val.name !== 'continue' ) {
                            arr.push({
                                name: val.name,
                                placeholder: val.description,
                                style: 'width:70%'
                            });
                        }
                    });
                    make_form( arr, '#generator', 'id="' + value.name + '-form" class="gen-form"' );
                    $('#' + value.name + '-form').hide();
                });
            });
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
    function make_form( data, appendto, attrs ) {
        if ( attrs === undefined ) {
            attrs = '';
        }
        var $form = $('<form '+ attrs + '></form>');
        //$form.attr( data );
        $.each( data, function ( index, value ) {
            if ( value.id === undefined ) {
                value.id = value.name;
            }
            if ( value.type === undefined ) {
                value.type = 'text';
            }
            if ( value.help !== undefined ) {
                $form.append(value.help + ': ');
            }
            var input = $('<input />');
            input.attr(value);
            $form.append(input);
            $form.append('<br />')
        });
        $(appendto).append($form);
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
                help: 'Edit summary'
            },
            {
                name: 'qid-value',
                placeholder: 'Value',
                class: 'item-autocomplete',
                help: 'Value'
            },
            {
                name: 'gen-category',
                placeholder: 'Category:Blah',
                help: 'Category'
            },
            {
                name: 'gen-site',
                placeholder: 'en.wikipedia.org',
                value: 'en.wikipedia.org',  // Mehhhhhhhhhhhhhh
                help: 'Site'
            },
            {
                name: 'ignore-list',
                placeholder: 'Ignore prefix list',
                help: 'Ignore prefixes'
            },
            {
                name: 'action-do',
                type: 'hidden',
                value: 'add-claims'
            },
            {
                name: 'submit',
                type: 'submit',
                value: 'Go!'
            }
        ];
        make_form( buttons, '#form2' );
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
                maxlength: 240
            },
            {
                name: 'action-do',
                type: 'hidden',
                value: 'remove-claims'
            },
            {
                name: 'submit',
                type: 'submit',
                value: 'Go!'
            }
        ];
        make_form( buttons, '#form2' );
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
        mw.notify('onsubmit');
        e.preventDefault();
        var val = $("#action-form input[type='radio']:checked").val();
        $('#action-form').hide(); // Done with that one.
        switch ( val ) {
            case 'remove-claims':
                remove_claims();
                break;
            case 'add-claims':
                add_claims();
                break;
            case 'generator':
                pick_a_generator();
                break;
            default:
                mw.notify('Gooooooodnight!');
        }
        return false;
    });

    make_action_form();
}(jQuery, mediaWiki));
