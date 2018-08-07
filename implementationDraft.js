/*
basic strategy for using SVG:
In SVG you can draw on an arbitrarily large plane and have a "viewbox" that shows a sub-area of that.
Because of this, for a piano roll, you can "draw" a piano-roll at an arbitrary size and move around
the viewbox rather than "redrawing" the piano roll when you want to zoom/move. What's TBD is to see
how annoying it might be to program selecting/dragging/highlighting/resizing with this approach. 
In general, aiming for Ableton piano-roll feature parity wrt mouse interaction (assuming keyboard 
shortcuts are trivial to implement if you can get the mouse stuff right)

order of library features to test (for each, make sure they're sensible under viewbox zoom too):
NOTE - this is only a test of INTERACTIONS - the look is ugly and the code is organized for quick hacking.
How note-state <-> note-svg-elements is handled is still TBD. 

- X - dragging behavior 
- X - dragging and snap to grid
    - NOTE - clicking on a note is interpeted as a "drag" and will automatically quantize it (see bugs below)
- X - multiselection + dragging via mouse
- X - multiselection + dragging + snap to grid
- X - multiselection and ableton style note length resizing
- X - multiselected resizing + snap to grid
    - done, but design choices necessary 
- figure out good UI for viewbox resizing/position control and scroll (panzoom plugin if necessary?)
    - figure out how to map mouse coordinates to SVG coordinates
- implement double-click to add note interaction (should be straightforwards, svg-wise)
- figure out cursor animation and viewbox movement for a playing piano roll
- decide how to do ableton "draw mode" style interaction (shouldn't require any new funky 
 SVG behavior, but will likely be tricky wrt UI-state management)

*/

//public vars to allow live-codable testing in the console

var svgRoot; //the svg root element

var l1, l2; //manually created "note" elements to test interaction

/* a dictionary that, upon the start of a group drag/resize event, stores the 
 * initial positions and lengths of all notes so that the mouse modifications to
 * one note can be bounced to the rest of the selected notes*/
var noteModStartReference;

//structure tracking both note info and note svg element state
var notes = {};

//elements selected by a mouse-region highlight
var selectedElements = new Set();
var selectRect; //the variable holding the mouse-region highlight svg rectabgle 

//svg elements in the pianoRoll background
var backgroundElements;



var quarterNoteWidth = 120; //in pixels
var noteHeight = 20; //in pixels
var whiteNotes = [0, 2, 4, 5, 7, 9, 11];
var noteSubDivision = 16; //where to draw lines and snap to grid
var timeSignature = 4/4; //b
var numMeasures = 100;
// Every quarter note region of the background will be alternately colored.
// In ableton this changes on zoom level
var sectionColoringDivision = 4; 
var NUM_MIDI_NOTES = 128;

//snap to grid quantization sizes
var xSnap = 1; //x-variable will change depending on user quantization choice, or be vertLineSpace as calculated below
var ySnap = noteHeight;

var backgroundColor1 = '#ddd';
var backgroundColor2 = '#bbb';
var noteColor = '#f23';
var selectedNoteColor = '#2ee'
var thickLineWidth = 1.8;
var thinLineWidth = 1;

// Create an SVGPoint for future math
var refPt; 

// Get point in global SVG space from mousemove event
function svgMouseCoord(evt){
  refPt.x = evt.clientX; 
  refPt.y = evt.clientY;
  return refPt.matrixTransform(svgRoot.node.getScreenCTM().inverse());
}

function drawBackground() {
    var pianoRollHeight = noteHeight * NUM_MIDI_NOTES;
    var pulsesPerMeasure = timeSignature * 4;
    var pianoRollWidth = quarterNoteWidth * pulsesPerMeasure * numMeasures;
    var numVertLines = numMeasures * pulsesPerMeasure * (noteSubDivision / 4);
    var vertLineSpace = pianoRollWidth / numVertLines;
    xSnap = vertLineSpace;
    var measureWidth = quarterNoteWidth*pulsesPerMeasure;
    svgRoot = SVG('drawing').attr('id', 'pianoRollSVG').size(1280, 720);
    refPt = svgRoot.node.createSVGPoint();

    backgroundElements = new Set();
    for(var i = 0; i < numMeasures; i++){
        var color = i % 2 == 0 ? backgroundColor1 : backgroundColor2;
        var panel = svgRoot.rect(measureWidth, pianoRollHeight).move(i*measureWidth, 0).fill(color);
        backgroundElements.add(panel);
    }
    for(var i = 1; i < numVertLines; i++){
        var xPos = i*vertLineSpace;
        var strokeWidth = xPos % quarterNoteWidth == 0 ? thickLineWidth : thinLineWidth;
        var line = svgRoot.line(xPos, 0, xPos, pianoRollHeight).stroke({width: strokeWidth});
        backgroundElements.add(line);
    }
    for(var i = 1; i < NUM_MIDI_NOTES; i++){
        var line = svgRoot.line(0, i*noteHeight, pianoRollWidth, i*noteHeight).stroke({width: thinLineWidth});
        backgroundElements.add(line);
    }
}


SVG.on(document, 'DOMContentLoaded', function() {

    drawBackground();

    // attach the interaction handlers for various gestures - currently just mouse-multi select
    // of notes, will later also attach handlers for ableton "draw mode" style interaction
    attachMouseModifierHandlers(backgroundElements, svgRoot);

    //set up the manipulatable elements (which will later be the notes)
    l1 = svgRoot.rect(quarterNoteWidth, noteHeight).move(0, 100).fill(noteColor);
    l2 = svgRoot.rect(quarterNoteWidth, noteHeight).move(0, 300).fill(noteColor);

    // Every new note created will have a newly generated noteId. This
    // is a quick setup to show what the note management could possibly look like.
    notes = {0: {elem: l1, info:{}}, 1: {elem: l2, info:{}}};
    l1.noteId = 0;
    l2.noteId = 1;
    Object.keys(notes).forEach(function(key){ //adding snap-to-grid
        var noteElem = notes[key].elem;
        noteElem.draggable().selectize({rotationPoint: false, points:["r", "l"]}).resize()
            .on('dragend', function(event){ snapPositionToGrid(this, xSnap, ySnap)});
            //todo - update/broadcast underlying note info, for both dragend and resizedone
    });


    /* the onscreen view area (the root SVG element) is only 300x300, but we have drawn shapes 
     * that are contained in a 400x400 box. the SVG viewbox feature lets you draw arbitraily  
     * sized images and then view them at whatever scale you want in your view area
     */
    svgRoot.viewbox(0, 0, 1280, 720);

    // setMouseMovementHandlers(svgRoot);

    $('#drawing').keydown(keydownHandler);
    $('#drawing').keyup(keyupHandler);
});


function mousemoveHandler(event){
    var svgXY = svgMouseCoord(event);
    if(mouseScrollActive){
        if(mouseDeltaRootNeedsReset){
            mouseDeltaRoot = svgXY;
            mouseDeltaRootNeedsReset = false;
        }
        // console.log("scrolling mouse", svgMouseCoord(event));
        console.log("scrolling mouse", svgXY.x - mouseDeltaRoot.x, svgXY.y - mouseDeltaRoot.y);
    }
}


var mouseScrollActive = false;
var mouseDeltaRootNeedsReset = true;
var mouseDeltaRoot = {x: -1, y: -1};

function keydownHandler(event){
    mouseDeltaRootNeedsReset = true;
    if(event.ctrlKey){
        mouseScrollActive = true;
        $('#drawing').mousemove(mousemoveHandler);
    }
    console.log("scrolling", mouseScrollActive);
}

function keyupHandler(event){
    if(!event.ctrlKey && mouseScrollActive) {
        mouseScrollActive = false;
        $('#drawing').off('mousemove');
    }
    console.log("scrolling", mouseScrollActive);
}

//function that snapes note svg elements into place
function snapPositionToGrid(elem, xSize, ySize){
    elem.x(Math.round(elem.x()/xSize) * xSize);
    elem.y(Math.round(elem.y()/ySize) * ySize); //because we're using lines instead of rectangles
}

// Resets the "start" positions/sizes of notes for multi-select transformations to current position/sizes
function refreshNoteModStartReference(noteIds){
    noteModStartReference = {};
    noteIds.forEach(function(id){ 
        noteModStartReference[id] = {
            x:  notes[id].elem.x(), 
            y:  notes[id].elem.y(), 
            width: notes[id].elem.width(), 
            height: notes[id].elem.height()
        };
    });
}

// sets event handlers on each note element for position/resize multi-select changes
function setMultiSelectListenersOnElement(noteElement){
    var selectedNoteIds = Array.from(selectedElements).map(elem => elem.noteId);

     refreshNoteModStartReference(selectedNoteIds);

    /* Performs the same drag deviation done on the clicked element to 
     * the other selected elements
     */
    noteElement.draggable().on('dragmove', function(event){
        var xMove = this.x() - noteModStartReference[this.noteId].x;
        var yMove = this.y() - noteModStartReference[this.noteId].y;
        var thisId = this.noteId;
        selectedNoteIds.forEach(function(id){
            if(id != thisId) {
                notes[id].elem.x(noteModStartReference[id].x + xMove);
                notes[id].elem.y(noteModStartReference[id].y + yMove);
            }
        });
    });

    /* remove the original dragend function which only snaps the target
     * element to the grid
     */
    noteElement.off('dragend'); 

    /* have a dragend function that snaps ALL selected elements to the grid
     */
    noteElement.draggable().on('dragend', function(event){
        selectedElements.forEach(function(elem){
            snapPositionToGrid(elem, xSnap, ySnap); 
        });
        //refresh the startReference so the next multi-select-transform works right
        refreshNoteModStartReference(selectedNoteIds);

        //todo - update/broadcast underlying note info
    });

    /* Performs the same resizing done on the clicked element to 
     * the other selected elements
     */
    noteElement.on('resizing', function(event){
        var oldX = noteModStartReference[this.noteId].x;
        var isEndChange = this.x() === oldX; //i.e, whehter you're moving the "start" or "end" of the note
        var thisId = this.noteId;
        selectedNoteIds.forEach(function(id){
            if(id != thisId){
                var oldNoteVals = noteModStartReference[id];
                if(isEndChange) { 
                    notes[id].elem.width(oldNoteVals.width + event.detail.dx);
                }
                else { 
                    notes[id].elem.width(oldNoteVals.width - event.detail.dx);
                    notes[id].elem.x(oldNoteVals.x + event.detail.dx);
                }
                //todo - update/broadcast underlying note info? or just at resizedone?
            }
        });
    });

    //refresh the startReference so the next multi-select-transform works right
    noteElement.on('resizedone', function(event){
        refreshNoteModStartReference(selectedNoteIds);
        //todo - update/broadcast underlying note info
    })
}

// stop bouncing position/size changes to other elements
function removeMultiSelectListeners(selectedElements_){
    console.log("remove multi", selectedElements_);
    selectedElements_.forEach(function(elem){
        elem.off('beforedrag');
        elem.off('dragmove');
        elem.off('dragend');
        elem.off('resizing');
        elem.on('dragend', function(event){snapPositionToGrid(this, xSnap, ySnap)})
        //todo - re-attach individual handler to update/broadcast underlying note info, for both dragend and resizedone
    });
}


function selectNote(noteElem){
    selectedElements.add(noteElem);
    noteElem.fill(selectedNoteColor);
}

function deselectNote(noteElem){
    selectedElements.delete(noteElem);
    noteElem.fill(noteColor);
}

// calculates if a note intersects with the mouse-multiselect rectangle
function selectRectIntersection(selectRect_, noteElem){
    //top-left and bottom right of bounding rect. done this way b/c getBBox doesnt account for line thickness
    var noteBox = {
        tl: {x: noteElem.x(), y: noteElem.y() - noteHeight/2},  
        br: {x: noteElem.x() + noteElem.width(), y: noteElem.y() + noteHeight/2},
    };
    var selectRectBox = selectRect.node.getBBox();
    var selectBox = {
        tl: {x: selectRectBox.x, y: selectRectBox.y},
        br: {x: selectRectBox.x + selectRectBox.width , y: selectRectBox.y + selectRectBox.height}
    };
    return boxIntersect(noteBox, selectBox);
}

//the actual rectangle intersection calculation, separated out for debugging ease
function boxIntersect(noteBox, selectBox){
    var returnVal = true;
    //if noteBox is full to the left or right of select box
    if(noteBox.br.x < selectBox.tl.x || noteBox.tl.x > selectBox.br.x) returnVal = false;

    //if noteBox is fully below or above rect box
    //comparison operators are wierd because image coordinates used e.g (0,0) at "upper left" of positive quadrant
    if(noteBox.tl.y > selectBox.br.y || noteBox.br.y < selectBox.tl.y) returnVal = false;
    // console.log("intersect", noteBox, selectBox, returnVal);
    return returnVal;
}

// attaches the appropriate handlers to the mouse event allowing to to 
// start a multi-select gesture (and later draw mode)
function attachMouseModifierHandlers(backgroundElements_, svgParentObj){
    var svgElem = svgParentObj.node;
 
    // need to listen on window so select gesture ends even if released outside the 
    // bounds of the root svg element or browser
    window.addEventListener('mouseup', function(event){
        // console.log("window up", event);

        //end a multi-select drag gesture
        if(selectRect) {
            if(selectedElements.size > 0 ){
                selectedElements.forEach(setMultiSelectListenersOnElement);
            }
            selectRect.draw('stop', event);
            selectRect.remove();
            svgParentObj.off("mousemove");
            selectRect = null;
        }
    });


    backgroundElements_.forEach(function(elem){
        elem.on('mousedown', function(event){
            // console.log("down", event);

            //clear previous mouse multi-select gesture state
            removeMultiSelectListeners(selectedElements);
            selectedElements.forEach(noteElem => deselectNote(noteElem));

            //restart new mouse multi-select gesture
            selectRect = svgParentObj.rect().fill('#008').attr('opacity', 0.25);
            selectRect.draw(event);
            svgParentObj.on("mousemove", function(event){
                
                //select notes which intersect with the selectRect (mouse selection area)
                Object.keys(notes).forEach(function(noteId){
                    var noteElem = notes[noteId].elem;
                    
                    // var intersecting = svgParentObj.node.checkIntersection(noteElem.node, selectRect.node.getBBox());
                    var intersecting = selectRectIntersection(selectRect, noteElem);
                    if(intersecting) {
                        // console.log([noteElem.y()], selectRect.node.getBBox())
                        selectNote(noteElem);                        
                    }
                    else {
                        deselectNote(noteElem)
                    }
                });
            })
        }); 
    });
}

/*
WORKING BUG LOG 
- X prefix means good workaround found, but the "common sense" approach still fails and idk why


- Clicking on notes snaps them all to grid - not necessarily technically a hard fix but need to 
  decide how auto-snapping will work, and need to make it work with resizing (snap start position
  on resize, but using a new function that doesn't "move" the whole note, just the start position?)
- X - mouseup doesn't properly get registered on background elements, drawing multi-select rect by 
  listening on the base svg element instead
- X - mousedrag selection using native-svg checkIntersection doesn't seem to be working correctly 
  with the note-line elements
*/


