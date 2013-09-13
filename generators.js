/**
 * blah blah blah
 * @author Legoktm
 */


function test() {
    var api = new mw.Api();
    api.get({
        action: 'query',
        meta: 'userinfo'
    }, {
        beforeSend: function () {
            console.log('YESSSS');
        }
    });
}

(function ($, mw) {

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

    function add_claim( pid, dataValue, editSummary, entity ) {
        var api = new mw.Api();
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
                log_event(entity, 'Added claim to ' + entity );
            });
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
        $form.append('<input type="radio" name="action" value="sleep" />Sleep<br />');
        $form.append('<input type="submit" value="Continue" />');
        $('#start').append($form);
    }

    var formDefaults = [
        {
            name: 'pid-value',
            placeholder: 'P###'
        },
        {
            name: 'edit-summary',
            placeholder: 'Edit summary'
        },
        {
            name: 'submit',
            _type: 'submit',
            value: 'Go!'
        }
    ];

    /**
     * Help make a html form
     * @param data see formDefaults above
     * @param appendto CSS selector for object to add on to
     */
    function make_form( data, appendto ) {
        var $form = $('<form></form>');
        $.each( data, function ( index, value ) {
            if ( value.id === undefined ) {
                value.id = value.name;
            }
            if ( value._type === undefined ) {
                value._type = 'text';
            }
            var i = '<input ';
            $.each( value, function( key, val ) {
                key = key === '_type' ? 'type' : key;
                i += key += '="' + val + '" ';
            });
            i += '/><br />';
            $form.append(i);
        });
        $(appendto).append($form);
    }

    function add_claims() {
        var buttons = [
            {
                name: 'pid-value',
                placeholder: 'P###'
            },
            {
                name: 'qid-value',
                placeholder: 'Value',
                class: 'item-autocomplete'
            },
            {
                name: 'edit-summary',
                placeholder: 'Edit summary'
            },
            {
                name: 'gen-category',
                placeholder: 'Category:Blah'
            },
            {
                name: 'gen-site',
                placeholder: 'en.wikipedia.org',
                value: 'en.wikipedia.org'  // Mehhhhhhhhhhhhhh
            },
            {
                name: 'ignore-list',
                placeholder: 'Ignore prefix list'
            },
            {
                name: 'submit',
                _type: 'submit',
                value: 'Go!'
            },
            {
                name: 'action-do',
                _type: 'hidden',
                value: 'add-claims'
            }
        ];
        make_form( buttons, '#form2' );
        mw.loader.using( 'jquery.ui.autocomplete', function () {
            $('#qid-value').autocomplete({
                source: function( request, response ) {
                    autocomplete_suggestions( request.term, 'item', response );
                }
            });
            $('#pid-value').autocomplete({
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
                placeholder: 'P###'
            },
            {
                name: 'edit-summary',
                placeholder: 'Edit summary'
            },
            {
                name: 'submit',
                _type: 'submit',
                value: 'Go!'
            },
            {
                name: 'action-do',
                _type: 'hidden',
                value: 'remove-claims'
            }
        ];
        make_form( buttons, '#form2' );
    }

    function do_remove_claims() {
        var pid = $('#pid-value').val().toUpperCase();
        var editSummary = $('#edit-summary').val();
        editSummary += ') ([[User:Legoktm/ADB|ADB]]';
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
                        log_event( entitydata.id, 'Skipped adding claim on ' + entitydata.id );
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
            default:
                mw.notify('Gooooooodnight!');
        }
        return false;
    });

    make_action_form();
}(jQuery, mediaWiki));


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
