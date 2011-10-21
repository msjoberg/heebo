/*
  Copyright 2011 Mats Sjöberg
  
  This file is part of the Heebo programme.
  
  Heebo is free software: you can redistribute it and/or modify it
  under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
  
  Heebo is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
  or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
  License for more details.
  
  You should have received a copy of the GNU General Public License
  along with Heebo.  If not, see <http://www.gnu.org/licenses/>.
*/

//-----------------------------------------------------------------------------

Qt.include("constants.js")

var board;
var bg_grid;

// List of coordinates of potentially uncleared points
var unclearedPoints;

// Keeps information about the two blocks that are swiched
var moving1;
var moving2;

// True when movement/switching of blocks is going on
var playerMovement = false;

//-----------------------------------------------------------------------------
// Utility functions, object constructors
//-----------------------------------------------------------------------------

// Constructs point objects
var point = function (spec) {
    var that = {};

    if (!isNumber(spec.x) || !isNumber(spec.y)) {
        console.log("Error non-number given to point constructor: "+spec);
        return that;
    }

    that.x = spec.x;
    that.y = spec.y;
    
    // FIXME: this is confusing, changes object itself
    that.plus = function (pt) {
        that.x += pt.x;
        that.y += pt.y;
        return that;
    };

    // FIXME: this is confusing, changes object itself
    that.minus = function (pt) {
        that.x -= pt.x;
        that.y -= pt.y;
        return that;
    };

    that.abs = function () {
        return Math.max(that.x.abs(),that.y.abs());
    };
    
    that.str = function () {
        return that.x+", "+that.y;
    };

    // FIXME: this is confusing, changes object itself
    that.mul = function (f) {
        that.x *= f;
        that.y *= f;
        return that;
    };

    that.insideGrid = function () {
        return that.x >= 0 && that.y >= 0 &&
            that.x < board_width && that.y < board_height;
    };

    return that;
};

//-----------------------------------------------------------------------------

var gridObject = function (grid, pt) {
    return pt.insideGrid() ? grid[pt.y][pt.x] : undefined;
};

//-----------------------------------------------------------------------------

var random = function (from, to) {
    return Math.floor(Math.random()*(to-from+1)+from);
};


//-----------------------------------------------------------------------------
// Functions for setting up the game level, boards and blocks
//-----------------------------------------------------------------------------

// Initialises a game grid, possibly destroying old elements
var init2DArray = function (arr) {
    // Destroy old 2d array if there is such
    if (arr !== undefined) {
        for (var i=0; i<board_width; i++) {
            for (var j=0; j<board_height; j++) {
                if (arr[j][i] !== undefined) {
                    arr[j][i].destroy();
                    arr[j][i] = undefined;
                }
            }
        }
        delete arr;
    }
    
    arr = new Array(board_height);
    for (var j=0; j<board_height; j++) 
        arr[j] = new Array(board_width);
    return arr;
};

//-----------------------------------------------------------------------------

// Initialises the board and the background grid
var initBoard = function () {
    board = init2DArray(board);
    board.set = function(pt, obj) {
        this[pt.y][pt.x] = obj;
    };

    bg_grid = init2DArray(bg_grid);
    bg_grid.isBlocking = function(pt) {
        var obj = this[pt.y][pt.x];
        return obj && obj.blocking;
    }
};

//-----------------------------------------------------------------------------

var newBlock = function (j, i, type) {
    var component = Qt.createComponent("Jewel.qml");
    
    // while (component.status != Component.Ready) {}
    
    var obj = component.createObject(background);
    obj.x = i*block_width;
    obj.y = j*block_height;

    obj.type = type;
    obj.spawned = true;
    board[j][i] = obj;
};

//-----------------------------------------------------------------------------

var newBackgroundBlock = function (j, i) {
    var component = Qt.createComponent("Block.qml");
    
    // while (component.status != Component.Ready) {}
    
    var obj = component.createObject(background);
    obj.x = i*block_width;
    obj.y = j*block_height;

    bg_grid[j][i] = obj;
};

//-----------------------------------------------------------------------------

// Starts new level
var startNewGame = function () {
    currentLevelText.text = mapset.level+1;
    lastLevelText.text = mapset.numLevels;
    mainPage.isRunning = false;

    playerMovement = false;
    initBoard();

    for (var j=0; j<board_height; j++)
        for (var i=0; i<board_width; i++)
            newBackgroundBlock(j, i);

    unclearedPoints = [];

    for (var j=0; j<board_height; j++) {
        for (var i=0; i<board_width; i++) {
            var b = mapset.at(j,i);
            if (b === 'W') {
                bg_grid[j][i].blocking = true;
            } else {
                bg_grid[j][i].wall_border = b;
                unclearedPoints.push(point({x:i, y:j}));
            }
        }
    }

    for (var j=0; j<board_height; j++) {
        for (var i=0; i<board_width; i++) {
            if (bg_grid[j][i].blocking) {
                continue;
            }
            
            var skip1 = 0;
            if (j > 1 && !bg_grid[j-2][i].blocking && !bg_grid[j-1][i].blocking
                && board[j-2][i].type === board[j-1][i].type)
                skip1 = board[j-1][i].type;

            var skip2 = 0;
            if (i > 1 && !bg_grid[j][i-2].blocking && !bg_grid[j][i-1].blocking
                && board[j][i-2].type === board[j][i-1].type)
                skip2 = board[j][i-1].type;

            var type = 0;
            do {
                type = random(1, jewel_maxtype);
            } while (type === skip1 || type === skip2);

            newBlock(j, i, type);
        }
    }
    
    return true;
};

//-----------------------------------------------------------------------------

// This is called once when the game has loaded
var init = function () {
    startNewGame();
};

//-----------------------------------------------------------------------------

// Restart with the first level
var firstLevel = function () {
    mapset.level = 0;
    startNewGame();
};

//-----------------------------------------------------------------------------

// Start the next level
var nextLevel = function () {
    mapset.level++;
    startNewGame();
};

//-----------------------------------------------------------------------------
// Main game logic functions, i.e. moving blocks, checking conditions,
// reacting to events.
// -----------------------------------------------------------------------------

// Check victory condition
var victoryCheck = function () {
    var victory = true;
    for (var j=0; j<board_height && victory; j++) {
        for (var i=0; i<board_width && victory; i++) {
            victory =
                bg_grid[j][i].cleared || bg_grid[j][i].blocking;
        }
    }

    if (victory && okDialog.isClosed()) {
        if (mapset.onLastLevel) {
            okDialog.mode = 1;
            okDialog.show("That was the last level!\n"+
                          "CONGRATULATIONS!!!",
                          "Wow, cool!!");
        } else {
            okDialog.mode = 0;
            okDialog.show("ZÖMG! You cleared the level! "+
                          "Want to have a go at the "+
                          "next one?",
                          "Yes, bring it on!");
        }
    }
};
    
//-----------------------------------------------------------------------------

// Checks if there are still animations running
var isRunning = function () {
    var running = false;
    for (var j=0; j<board_height && !running; j++) {
        for (var i=0; i<board_width && !running; i++) {
            var obj = board[j][i];
            if (obj === undefined)
                continue;
            if (obj.xAnim.running || obj.yAnim.running)
                running = true;
        }
    }

    mainPage.isRunning = running;
    return running;
};

//-----------------------------------------------------------------------------

// Clear random a block of given type
var clearRandomBlock = function (block_type, count) {
    var i, pt, bg, obj;

    if (!isNumber(block_type) || !isNumber(count)) {
        console.log("Bad call: clearRandomBlock("+block_type+", "+count+")");
        return;
    }

    // First, prune the unclearedPoints list from already cleared
    // points.
    for (i=unclearedPoints.length-1; i>=0; i--) {
        pt = unclearedPoints[i];
        bg = bg_grid[pt.y][pt.x];
        if (bg.blocking || bg.cleared) {
            unclearedPoints.splice(i, 1);
        }
    }

    // Make a copy of the unclearedPoints list so that we can freely
    // remove items from it.
    var list = unclearedPoints.slice(0);

    // Second, try to find an uncleared point with the correct type.
    while (list.length > 0 && count > 0) {
        // Remove a random point from the list.
        i = random(0,list.length-1);
        pt = list.splice(i, 1)[0];

        obj = board[pt.y][pt.x];

        // If the block object is defined and of the correct type
        // clear it.
        if (obj !== undefined && obj.type === block_type) {
            bg_grid[pt.y][pt.x].cleared = true;
            count--;
        }
    } 
};

//-----------------------------------------------------------------------------

// Check if blocks should fall down
var fallDown = function () {
    var changes = 0;
    for (var i=0; i<board_width; i++) {
        var fallDist = 0;
        for (var j=board_height-1; j>=0; j--) {
            if (bg_grid[j][i].blocking) {
                fallDist = 0;
            } else if (board[j][i] === undefined) {
                fallDist++;
            } else {
                if (fallDist > 0) {
                    var obj = board[j][i];
                    obj.y = (j+fallDist)*block_height;
                    board[j+fallDist][i] = obj;
                    board[j][i] = undefined;
                    changes++;
                }
            }
        }
    }
    return changes;
};

//-----------------------------------------------------------------------------

// Check one line (row/column) for subsequent jewels of same colour.
// j gives the row/column
// rows is true for checking row, false for column
var checkSubsequentLine = function(j, rows, mark) {
    var last_b = 0, count = 0, changes = 0, i;
    var imax = rows ? board_width : board_height;

    for (i=0; i<imax; i++) {
        var obj = rows ? board[j][i] : board[i][j];
        var b = 0;

        if (obj)
            b = obj.type;

        if (b != 0 && last_b === b)
            count++;

        if (last_b !== b || i === imax-1) {
            if (count >= 2) {
                if (mark) {
                    var k_begin = i-count-1;
                    var k_end = i;
                    if (last_b === b) {
                        k_begin++;
                        k_end++;
                    }
                    
                    for (var k=k_begin; k<k_end; k++) {
                        if (rows) {
                            board[j][k].to_remove = true;
                            bg_grid[j][k].cleared = true;
                        } else {
                            board[k][j].to_remove = true;
                            bg_grid[k][j].cleared = true;
                        }
                    }
                    
                    if (count >= 3) {
                        clearRandomBlock(last_b, count-2);
                    }
                }
                changes++;
            }
            count = 0;
        }
        last_b = b;
    }
    return changes;
};

//-----------------------------------------------------------------------------

var checkSubsequentOnRows = function (mark) {
    var changes = 0, j;
    for (j=0; j<board_height; j++) {
        changes += checkSubsequentLine(j, true, mark);
    }
    return changes;
};

//-----------------------------------------------------------------------------

var checkSubsequentOnColumns = function (mark) {
    var changes = 0, i;
    for (i=0; i<board_width; i++) {
        changes += checkSubsequentLine(i, false, mark);
    }
    return changes;
};

//-----------------------------------------------------------------------------

// Checks board for 3 or more subsequent jewels
var checkForSubsequentJewels = function (mark) {
    var changes = 0;

    // Check rows for subsequent items
    changes += checkSubsequentOnRows(mark);

    // Check columns for subsequent items
    changes += checkSubsequentOnColumns(mark);

    // If we're just checking, now is a good time to return
    if (!mark)
        return changes;

    // Do actual removal
    for (var j=0; j<board_height; j++) {
        for (var i=0; i<board_width; i++) {
            var obj = board[j][i];
            if (obj !== undefined && obj.to_remove) {
                board[j][i] = undefined;
                obj.dying = true;
            }
        }
    }

    return changes;
};

//-----------------------------------------------------------------------------

var checkSwitch = function (pt1, pt2) {
    var changes = 0;
    changes += checkSubsequentLine(pt1.x, false, false);
    changes += checkSubsequentLine(pt1.y, true, false);
    changes += checkSubsequentLine(pt2.x, false, false);
    changes += checkSubsequentLine(pt2.y, true, false);
    return changes;
};

//-----------------------------------------------------------------------------

var checkSingleStep = function(obj, pt, dx, dy) {
    var pt2, obj2, changes;

    if (obj === undefined || bg_grid.isBlocking(pt)) {
        // console.log("We should never get here.");
        return false;
    }
    
    pt2 = point(pt).plus({x: dx, y: dy});
    if (!pt2.insideGrid() || bg_grid.isBlocking(pt2)) {
        // console.log(pt.str()+" -> "+pt2.str()+" X (outside or blocking)");
        return false;
    }

    obj2 = gridObject(board, pt2);
    if (obj2 === undefined) {
        // console.log(pt.str()+" -> "+pt2.str()+" OK (nothing there)");
        return true;
    }
    
    board.set(pt, obj2);
    board.set(pt2, obj);

    changes = checkSwitch(pt, pt2);

    board.set(pt, obj);
    board.set(pt2, obj2);

    // if (changes>0) {
    //     console.log(pt.str()+" -> "+pt2.str()+" OK");
    // } else {
    //     console.log(pt.str()+" -> "+pt2.str()+" X (no changes)");
    // }    

    return changes>0;
};

//-----------------------------------------------------------------------------

var checkMoves = function () {
    var i, j, obj;
    var di, dj;
    var pt;
    
    for (i=0; i<board_width; i++) {
        for (j=0; j<board_height; j++) {
            pt = point({x: i, y: j});
            obj = gridObject(board, pt);

            // No need to check if there's no object at i,j
            if (obj === undefined || bg_grid.isBlocking(pt))
                continue;
            
            if (checkSingleStep(obj, pt, -1,  0)) return true;
            if (checkSingleStep(obj, pt,  1,  0)) return true;
            if (checkSingleStep(obj, pt,  0, -1)) return true;
            if (checkSingleStep(obj, pt,  0,  1)) return true;
        }
    }
    
    return false;
};

//-----------------------------------------------------------------------------

var checkMovesAndReport = function () {
    var movesLeft = checkMoves();
    if (!movesLeft) {
        okDialog.mode = 2;
        okDialog.show("No more moves!\n"+
                      "I'll reshuffle the blocks.",
                      "OK, thanks!");
    }
};

//-----------------------------------------------------------------------------

// Checks if new blocks need to be spawned
var spawnNewJewels = function () {
    for (var i=0; i<board_width; i++) {
        var n=0;
        while (n<board_height && board[n][i] === undefined &&
               bg_grid[n][i].blocking === false)
            n++;

        for (var j=0; j<n; j++) {
            var component = Qt.createComponent("Jewel.qml");
    
            var obj = component.createObject(background);
            obj.x = i*block_width;
            obj.y = -block_height*(j+1);

            obj.type = random(1, jewel_maxtype);
            obj.spawned = true;
            board[n-j-1][i] = obj;
            obj.y = block_height*(n-j-1);
        }
    }
};

//-----------------------------------------------------------------------------

// Called when "stuff has changed", i.e. movement stopped, jewels
// destroyed, ...
var onChanges = function () {
    if (playerMovement) {
        var changes = checkSwitch(moving1.bpt, moving2.bpt);
        
        if (bg_grid.isBlocking(moving2.bpt) || 
            (!changes && moving2.obj !== undefined))
        {
            board.set(moving1.bpt, moving1.obj);
            board.set(moving2.bpt, moving2.obj);

            moving1.obj.moveToBlock(moving1.bpt);
            if (moving2.obj !== undefined) {
                moving2.obj.moveToPoint(moving2.oldPt);
            }
        }
        playerMovement = false;
    }

    fallDown();

    if (!isRunning()) {
        spawnNewJewels();
        fallDown();
    }

    if (!isRunning()) 
        checkForSubsequentJewels(true);

    victoryCheck();

    if (!isRunning())
        checkMovesAndReport();
};

//-----------------------------------------------------------------------------

var reshuffleBlocks = function () {
    var obj;
    for (var j=0; j<board_height; j++) {
        for (var i=0; i<board_width; i++) {
            obj = gridObject(board, point({x:i, y:j}));
            if (obj === undefined)
                continue;

            obj.type = random(1, jewel_maxtype);
        }
    }
    onChanges();
};

//-----------------------------------------------------------------------------

var dialogClosed = function (mode) {
    switch (mode) {
    case 0:
        nextLevel();
        break;
    case 1:
        mainMenu.toggle();
        break;
    case 2:
        reshuffleBlocks();
        break;
    default:
        console.log("dialogClosed("+mode+"): unknown dialog mode.");
    }
};

//-----------------------------------------------------------------------------

// Called when user presses mouse button or taps down
var mousePressed = function (x, y) {
    if (playerMovement) {
        if (!isRunning()) {
            // console.log("Weird: playerMovement===true but isRunning()===false");
            playerMovement=false;
        }
        return;
    }

    moving1 = {};
    moving1.pt = point({x: x, y: y});
    moving1.bpt = point({x: Math.floor(x/block_width),
                        y:Math.floor(y/block_height)});
    moving1.obj = gridObject(board, moving1.bpt);
};

//-----------------------------------------------------------------------------

// Called when user moves mouse or swipes 
var mouseMoved = function (x, y) {
    if (moving1 === undefined || moving1.obj === undefined ||
        okDialog.visible || mainMenu.visible || isRunning())
    {
        if (!playerMovement)
            moving1 = undefined;
        return;
    }

    if (playerMovement)
        return;

    var dd = point({x:x, y:y}).minus(moving1.pt);

    var dist = dd.x.abs()-dd.y.abs();
    if (dist.abs() < move_limit)
        return;

    if (dd.x.abs() > dd.y.abs()) {
        dd = point({x:dd.x.sign(), y:0});
    } else {
        dd = point({x:0, y:dd.y.sign()});
    }

    moving2 = {};
    moving2.bpt = point(moving1.bpt).plus(dd);
    moving2.obj = gridObject(board, moving2.bpt);

    if (!moving2.bpt.insideGrid() || bg_grid.isBlocking(moving2.bpt))
        return;

    playerMovement = true;

    board.set(moving2.bpt, moving1.obj);
    board.set(moving1.bpt, moving2.obj);
    moving1.obj.moveToBlock(moving2.bpt);

    if (moving2.obj !== undefined) {
        moving2.oldPt = point(moving2.obj);
        moving2.obj.moveToBlock(moving1.bpt);
    }
};

