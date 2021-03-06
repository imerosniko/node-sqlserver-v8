//---------------------------------------------------------------------------------------------------------------------------------
// File: txn.js
// Contents: test suite for transactions
//
// Copyright Microsoft Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

var assert = require( 'assert' );
var supp = require('../demo-support');

suite( 'txn', function() {

    var theConnection;
    this.timeout(20000);
    var conn_str;
    var support;
    var async;
    var helper;
    var driver;

    var sql = global.native_sql;

    setup(function (test_done) {
        supp.GlobalConn.init(sql, function(co) {
            conn_str = co.conn_str;
            driver = co.driver;
            support = co.support;
            async = co.async;
            helper =  co.helper;
            helper.setVerbose(false);
            sql.open(conn_str, function (err, new_conn) {
                assert.ifError(err);
                theConnection = new_conn;
                test_done();
            });
        })
    });

    teardown(function (done) {
        theConnection.close(function() {
            done();
        });
    });

    test( 'setup for tests', function( test_done ) {
        // single setup necessary for the test

        var fns = [

            function( async_done ) {
                try {
                    var q = sql.query( conn_str, "drop table test_txn", function( err, results ) {

                        async_done();
                    });
                }
                    // skip any errors because the table might not exist
                catch( e ) {
                    async_done();
                }
            },
            function( async_done ) {
                sql.query( conn_str, "create table test_txn (id int identity, name varchar(100))", function( err, results ) {

                    assert.ifError( err );
                    async_done();
                });
            },
            function (async_done) {
                theConnection.queryRaw("create clustered index index_txn on test_txn (id)", function (err) {
                    assert.ifError(err);
                    async_done();
                });
            }
        ];

        async.series( fns, function () {
            test_done();
        });
    });

    test('begin a transaction and rollback with no query', function( done ) {

        theConnection.beginTransaction( function( err ) { assert.ifError( err ); });
        theConnection.rollback( function( err ) { assert.ifError( err ); done(); });
    });

    test('begin a transaction and rollback with no query and no callback', function( done ) {

        try {

            theConnection.beginTransaction();
            theConnection.rollback( function( err ) {
                assert.ifError( err );
                done();
            });
        }
        catch( e ) {

            assert.ifError( e );
        }
    });

    test('begin a transaction and commit', function( test_done ) {

        var fns = [

            function (async_done) {
                theConnection.beginTransaction(function (err) {
                    assert.ifError(err);
                    async_done();
                });
            },

            function (async_done) {
                theConnection.queryRaw("INSERT INTO test_txn (name) VALUES ('Anne')", function (err, results) {
                    assert.ifError(err);
                    assert.deepEqual(results, {meta: null, rowcount: 1}, "Insert results don't match");
                    async_done();
                });
            },
            function (async_done) {
                theConnection.queryRaw("INSERT INTO test_txn (name) VALUES ('Bob')", function (err, results) {
                    assert.ifError(err);
                    assert.deepEqual(results, {meta: null, rowcount: 1}, "Insert results don't match");
                    async_done();
                });
            },
            function (async_done) {
                theConnection.commit(function (err) {
                    assert.ifError(err);
                    async_done();
                });
            },
            function (async_done) {
                theConnection.queryRaw("select * from test_txn", function (err, results) {
                    assert.ifError(err);

                    // verify results
                    var expected = {
                        'meta': [{
                            'name': 'id',
                            'size': 10,
                            'nullable': false,
                            'type': 'number',
                            sqlType: 'int identity'
                        },
                            {'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar'}],
                        'rows': [[1, 'Anne'], [2, 'Bob']]
                    };

                    assert.deepEqual(results, expected, "Transaction not committed properly");
                    async_done();
                });
            }
        ];
        async.series(fns, function () {
            test_done();
        });
    });

    test('begin a transaction and rollback', function( test_done ) {

        var fns = [

            function (async_done) {
                theConnection.beginTransaction(function (err) {
                    assert.ifError(err);
                    async_done();
                });
            },
            function (async_done) {
                theConnection.queryRaw("INSERT INTO test_txn (name) VALUES ('Carl')", function (err, results) {
                    assert.ifError(err);
                    assert.deepEqual(results, {meta: null, rowcount: 1}, "Insert results don't match");
                    async_done();
                });
            },
            function (async_done) {
                theConnection.queryRaw("INSERT INTO test_txn (name) VALUES ('Dana')", function (err, results) {
                    assert.ifError(err);
                    assert.deepEqual(results, {meta: null, rowcount: 1}, "Insert results don't match");
                    async_done();
                });
            },
            function (async_done) {
                theConnection.rollback(function (err) {
                    assert.ifError(err);
                    async_done();
                });
            },
            function (async_done) {
                theConnection.queryRaw("select * from test_txn", function (err, results) {
                    assert.ifError(err);

                    // verify results
                    var expected = {
                        'meta': [{
                            'name': 'id',
                            'size': 10,
                            'nullable': false,
                            'type': 'number',
                            sqlType: 'int identity'
                        },
                            {'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar'}],
                        'rows': [[1, 'Anne'], [2, 'Bob']]
                    };

                    assert.deepEqual(results, expected, "Transaction not rolled back properly");
                    async_done();
                });
            }
        ];

        async.series(fns, function () {
            test_done();
        });
    });

    test('begin a transaction and then query with an error', function( test_done ) {

        var fns = [

            function (async_done) {
                theConnection.beginTransaction(function (err) {
                    assert.ifError(err);
                    async_done();
                });
            },

            function (async_done) {
                var q = theConnection.queryRaw("INSERT INTO test_txn (naem) VALUES ('Carl')");
                // events are emitted before callbacks are called currently
                q.on('error', function (err) {

                    var expected = new Error("[Microsoft][" + driver + "][SQL Server]Unclosed quotation mark after the character string 'm with STUPID'.");
                    expected.sqlstate = '42S22';
                    expected.code = 207;

                    assert.deepEqual(err, expected, "Transaction should have caused an error");

                    theConnection.rollback(function (err) {
                        assert.ifError(err);
                        async_done();
                    });
                });
            },

            function (async_done) {
                theConnection.queryRaw("select * from test_txn", function (err, results) {
                    assert.ifError(err);
                    assert.ifError(err);

                    // verify results
                    var expected = {
                        'meta': [{
                            'name': 'id',
                            'size': 10,
                            'nullable': false,
                            'type': 'number',
                            sqlType: 'int identity'
                        },
                            {'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar'}],
                        'rows': [[1, 'Anne'], [2, 'Bob']]
                    };

                    assert.deepEqual(results, expected, "Transaction not rolled back properly");
                    async_done();
                });
            }
        ];

        async.series(fns, function () {
            test_done();
        })
    });

    test('begin a transaction and commit (with no async support)', function( test_done ) {

        theConnection.beginTransaction( function( err ) {
            assert.ifError( err );
        });

        theConnection.queryRaw( "INSERT INTO test_txn (name) VALUES ('Anne')", function( err, results ) {
            assert.ifError( err );
        });

        theConnection.queryRaw( "INSERT INTO test_txn (name) VALUES ('Bob')", function( err, results ) {
            assert.ifError( err );
        });

        theConnection.commit( function( err ) {
            assert.ifError( err );
        });

        theConnection.queryRaw( "select * from test_txn", function( err, results ) {
            assert.ifError( err );

            // verify results
            var expected = { 'meta':
                [ { 'name': 'id', 'size': 10, 'nullable': false, 'type': 'number', sqlType: 'int identity' },
                    { 'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar' } ],
                'rows': [ [ 1, 'Anne' ], [ 2, 'Bob' ], [ 5, 'Anne' ], [ 6, 'Bob' ] ] };

            assert.deepEqual( results, expected, "Transaction not committed properly" );

            test_done();
        });
    });
});

