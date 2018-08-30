"use strict";
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
- X figure out good UI for viewbox resizing/position control and scroll (panzoom plugin if necessary?)
    - done, but more polished design choices necessary 
    - could implement 2 finger scroll - https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Multi-touch_interaction
- X implement double-click to add note interaction (should be straightforwards, svg-wise)
- X implement delete
- X implement undo/redo
- get to ableton parity with regards to 
    - X selected notes and then moving/resizing a non-sected note 
    - POSTPONED - handle drag quantization to be ableton like
    - need to handle out-of-bounds dragging
    - handling overlaps on resizing, drag and doubleclick-to-add-note
        - resizing quantization should be triggered once the end nears a note-section border. currently it quantizes
          once the deviation distance is near the quanization length
        - in general - if selected/new notes intersect with start start of "other" note, the "other" note is deleted,
          and if they intersect with the end of "other" notes, the "other" notes are truncated.
          - The exception is if a selected note is resized into another selected note, in which case the resizing is 
            truncated at the start of the next selected note
- implement showing note names on notes
- implement cursor and cut/copy/paste
- implement moving highlighted notes by arrow click 
- figure out floating note names on side and time-values on top 
- figure out cursor animation and viewbox movement for a playing piano roll
- decide how to do ableton "draw mode" style interaction (shouldn't require any new funky 
 SVG behavior, but will likely be tricky wrt UI-state management)


 comment tags
 cleanup - stuff that works but needs cleaning
 inProgress - stuff that's not totally built yet
 future - guide notes for longer term extensible implementation ideas
 postponed - features that are wanted but can be done later

*/



var svgRoot; //the svg root element

/* a dictionary that, upon the start of a group drag/resize event, stores the 
 * initial positions and lengths of all notes so that the mouse modifications to
 * one note can be bounced to the rest of the selected notes*/
var noteModStartReference;

//structure tracking both note info and note svg element state
var notes = {};


//used to track note show/hide on resize/drag - map of pitch -> noteInfo of that pitch sorted by start time
var spatialNoteTracker = {}

//elements selected by a mouse-region highlight
var selectedElements = new Set();
var selectedNoteIds = []; //IDs of selected notes saved separtely to speed up multi drag/resize performance

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
var viewportHeight = 720;
var viewportWidth = 1280;
var maxZoom;
var noteCount = 0;
// Create an SVGPoint for future math
var refPt; 
var shiftKeyDown = false;


var historyList = [[]]; //list of states. upon an edit, the end of historyList is always the current state 

// How far away from end of array (e.g, how many redos available).
//  historyListIndex  is always the index of the current state in historyList
var historyListIndex = 0; 

var pianoRollHeight;
var pianoRollWidth

SVG.on(document, 'DOMContentLoaded', function() {

    drawBackground();

    // attach the interaction handlers not related to individual notes
    attachHandlersOnBackground(backgroundElements, svgRoot);

    addNote(120, 0, 1, false);
    addNote(115, 0, 1, false);


    //set the view-area so we aren't looking at the whole 127 note 100 measure piano roll
    svgRoot.viewbox(0, 0, viewportWidth, viewportHeight);

    // setMouseMovementHandlers(svgRoot);

    $('#drawing').keydown(keydownHandler);
    $('#drawing').keyup(keyupHandler);
});


function drawBackground() {
    pianoRollHeight = noteHeight * NUM_MIDI_NOTES;
    var pulsesPerMeasure = timeSignature * 4;
    pianoRollWidth = quarterNoteWidth * pulsesPerMeasure * numMeasures;
    var numVertLines = numMeasures * pulsesPerMeasure * (noteSubDivision / 4);
    var vertLineSpace = pianoRollWidth / numVertLines;
    xSnap = vertLineSpace;
    var measureWidth = quarterNoteWidth*pulsesPerMeasure;
    svgRoot = SVG('drawing').attr('id', 'pianoRollSVG').size(viewportWidth, viewportHeight);
    refPt = svgRoot.node.createSVGPoint();
    maxZoom = viewportHeight / pianoRollHeight;

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

var pitchStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var textDev = 4;
//duration is number of quarter notes, pitch is 0-indexed MIDI
function addNote(pitch, position, duration, isHistoryManipulation){
    var rect = svgRoot.rect(duration*quarterNoteWidth, noteHeight).move(position*quarterNoteWidth, (127-pitch)*noteHeight).fill(noteColor);;
    rect.noteId = noteCount;
    rect.selectize({rotationPoint: false, points:["r", "l"]}).resize();
    var text = svgRoot.text(svgYToPitchString(rect.y()))
        .font({size: 14})
        .move(position*quarterNoteWidth + textDev, (127-pitch)*noteHeight)
        .style('pointer-events', 'none');
    attachHandlersOnElement(rect, svgRoot);
    notes[noteCount] = {
        elem: rect, 
        info: {pitch, position, duration},
        label: text
    }
    noteCount++;
    if(!isHistoryManipulation){
        snapshotNoteState();
    }
    return rect.noteId;
}

function deleteElement(elem){
    elem.selectize(false);
    elem.remove();
    notes[elem.noteId].label.remove();
}

function deleteNotes(elements){
    //for selected notes - delete svg elements, remove entries from "notes" objects
    elements.forEach(function(elem){
        deleteElement(elem);
        delete notes[elem.noteId];
    });
    snapshotNoteState();
}

//update underlying note info from SVG element change
function updateNoteInfo(note, calledFromBatchUpdate){
    if(note.elem.visible()) {
        var pitch = svgYtoPitch(note.elem.y());
        var position = svgXtoPosition(note.elem.x());
        var duration = note.elem.width()/quarterNoteWidth;
        note.info = {pitch, position, duration};
    } else {
        deleteElement(note.elem);
        delete notes[note.elem.noteId];
    }
    if(!calledFromBatchUpdate) snapshotNoteState();
}

//a separate function so that batch note changes are saved in the undo history as a single event
function updateNoteInfoMultiple(notes){
    notes.forEach(note => updateNoteInfo(note, true));
    snapshotNoteState();
}

//update note SVG element from underlying info change
function updateNoteElement(note){
    note.elem.show();
    note.elem.x(note.info.position * quarterNoteWidth);
    note.elem.y((127-note.info.pitch)*noteHeight);
    note.elem.width(note.info.duration*quarterNoteWidth);
    note.label.x(note.info.position * quarterNoteWidth + textDev);
    note.label.y((127-note.info.pitch)*noteHeight);
    note.label.text(svgYToPitchString(note.label.y()));
}


//public vars to allow live-codable testing in the console
var bound = (n, l, h) => Math.min(h, Math.max(l, n));

// Get point in global SVG space from mousemove event
function svgMouseCoord(evt){
  refPt.x = evt.clientX; 
  refPt.y = evt.clientY;
  return refPt.matrixTransform(svgRoot.node.getScreenCTM().inverse());
}

function svgYtoPitch(yVal) {return 127 - yVal/noteHeight;}
function svgXtoPosition(xVal) {return xVal/quarterNoteWidth}
function svgXYtoPitchPos(xVal, yVal){
    return {pitch: 127 - yVal/noteHeight, position: xVal/quarterNoteWidth};
}
function svgXYtoPitchPosQuant(xVal, yVal) {
    var notesPerQuarterNote = noteSubDivision/4;
    var rawPosition = xVal / quarterNoteWidth;
    return {pitch: 127 - Math.floor(yVal/noteHeight), position: Math.floor(rawPosition * notesPerQuarterNote)/notesPerQuarterNote};
}


// need to calculate mouse delta from screen coordinates rather than SVG coordinates because
// the SVG view moves after every frame, thus changing the read mouse coordintates and creating
// wild feedback. root is the mouse position "snapshot" against which the delta is measured
function getMouseDelta(event, root){
    return {x: event.clientX - root.mouseX, y: event.clientY - root.mouseY};
}

//take a snapshot of the mouse position and viewbox size/position
function resetMouseMoveRoot(event){
    var vb = svgRoot.viewbox();
    var svgXY = svgMouseCoord(event);
    mouseMoveRoot = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        svgX: svgXY.x,
        svgY: svgXY.y,
        vbX: vb.x,
        vbY: vb.y,
        vbWidth: vb.width,
        vbHeight: vb.height,
        zoom: vb.zoom
    };
    mouseMoveRootNeedsReset = false;
}

var mouseScrollActive = false;
var mouseZoomActive = false;
var mouseMoveRootNeedsReset = true;
var mouseMoveRoot = {x: -1, y: -1};

function mouseScrollHandler(event){
    if(mouseMoveRootNeedsReset) resetMouseMoveRoot(event);
    if(mouseScrollActive){
        var mouseDetla = getMouseDelta(event, mouseMoveRoot);
        
        //inverted scrolling
        var scrollFactor = 1/mouseMoveRoot.zoom;
        var newVBPos = {
            x: bound(mouseMoveRoot.vbX - mouseDetla.x * scrollFactor, 0, pianoRollWidth - mouseMoveRoot.vbWidth),
            y: bound(mouseMoveRoot.vbY - mouseDetla.y * scrollFactor, 0, pianoRollHeight - mouseMoveRoot.vbHeight)
        };
        svgRoot.viewbox(newVBPos.x, newVBPos.y, mouseMoveRoot.vbWidth, mouseMoveRoot.vbHeight);
    }
}

function mouseZoomHandler(event){
    if(mouseMoveRootNeedsReset) resetMouseMoveRoot(event);
    if(mouseZoomActive){
        var mouseDetla = getMouseDelta(event, mouseMoveRoot);

        var zoomChange = (4**(mouseDetla.y/mouseMoveRoot.zoom / mouseMoveRoot.vbHeight));
        var zoomFactor = mouseMoveRoot.zoom * zoomChange;
        if(zoomFactor < maxZoom) return;
        
        var svgMouseVBOffsetX = mouseMoveRoot.svgX - mouseMoveRoot.vbX;
        var svgMouseVBOffsetY = mouseMoveRoot.svgY - mouseMoveRoot.vbY;
        var newWidth = mouseMoveRoot.vbWidth/zoomChange;
        var newHeight = mouseMoveRoot.vbHeight/zoomChange;
        var newVBPos = {
            x: bound(mouseMoveRoot.svgX - svgMouseVBOffsetX/zoomChange, 0, pianoRollWidth - newWidth),
            y: bound(mouseMoveRoot.svgY - svgMouseVBOffsetY/zoomChange, 0, pianoRollHeight - newHeight)
        };

        svgRoot.viewbox(newVBPos.x, newVBPos.y, newWidth, newHeight);
    }
}

function keydownHandler(event){
    if(event.key == "Shift") shiftKeyDown = true; 
    if(event.ctrlKey && !event.altKey){
        mouseMoveRootNeedsReset = true;
        mouseScrollActive = true;
        $('#drawing').mousemove(mouseScrollHandler);
    }
    if(event.altKey && !event.ctrlKey){
        mouseMoveRootNeedsReset = true;
        mouseZoomActive = true;
        $('#drawing').mousemove(mouseZoomHandler);
    }
    if(event.key == "Backspace"){
        deleteNotes(selectedElements);
        event.stopPropagation();
    }
    if(event.key === "z" && event.metaKey){
        if(shiftKeyDown) executeRedo();
        else executeUndo();
    }
}

function keyupHandler(event){
    if(event.key == "Shift") shiftKeyDown = false; 
    if(!event.ctrlKey && mouseScrollActive) {
        mouseScrollActive = false;
        $('#drawing').off('mousemove');
    }
    if(!event.altKey && mouseZoomActive) {
        mouseZoomActive = false;
        $('#drawing').off('mousemove');
    }
}

function snapshotNoteState(){
    console.log("snapshot", historyList.length, historyListIndex);
    var noteState = Object.values(notes).map(note => note.info);
    if(historyListIndex == historyList.length-1){
        historyList.push(noteState);
    } else {
        historyList = historyList.splice(0, historyListIndex+1);
        historyList.push(noteState);
    }
    historyListIndex++;
}

function executeUndo() {
    if(historyListIndex == 0) return; //always start with an "no-notes" state
    historyListIndex--;
    restoreNoteState(historyListIndex);
}

function executeRedo() {
    if(historyListIndex == historyList.length-1) return;
    historyListIndex++;
    restoreNoteState(historyListIndex);
}

function restoreNoteState(histIndex){
    Object.values(notes).forEach(note => deleteElement(note.elem));
    notes = {};
    var noteState = historyList[histIndex];
    noteState.forEach(function(noteInfo){
        addNote(noteInfo.pitch, noteInfo.position, noteInfo.duration, true);
    });
}

function svgYToPitchString(yVal){
    var pitch = svgYtoPitch(yVal);
    return pitchStrings[pitch%12] + (Math.floor(pitch/12)-2);
}

//function that snapes note svg elements into place
function snapPositionToGrid(elem, xSize, ySize){
    elem.x(Math.round(elem.x()/xSize) * xSize);
    elem.y(Math.round(elem.y()/ySize) * ySize); //because we're using lines instead of rectangles
    var label = notes[elem.noteId].label;
    label.x(Math.round(elem.x()/xSize) * xSize + textDev);
    label.y(Math.round(elem.y()/ySize) * ySize); //because we're using lines instead of rectangles
    label.text(svgYToPitchString(label.y()));
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


//used to differentiate between "clicks" and "drags" from a user perspective
//to stop miniscule changes from being added to undo history
function checkIfNoteMovedSignificantly(noteElement, thresh){
    return Math.abs(noteElement.x() - noteModStartReference[noteElement.noteId].x) > thresh || Math.abs(noteElement.y() - noteModStartReference[noteElement.noteId].y) > thresh;
}

//used to differentiate between "clicks" and "resize" from a user perspective 
//to stop miniscule changes from being added to undo history
function checkIfNoteResizedSignificantly(noteElement, thresh){
    return Math.abs(noteElement.width() - noteModStartReference[noteElement.noteId].width) > thresh;
}

function initializeNoteModificationAction(element){
    selectedNoteIds = Array.from(selectedElements).map(elem => elem.noteId);
    nonSelectedModifiedNotes.clear();
    if(!selectedNoteIds.includes(element.noteId)) {
        if(!shiftKeyDown) clearNoteSelection();
        selectNote(element);
        selectedNoteIds = [element.noteId];
    }
    populateSpatialNoteTracker();
    refreshNoteModStartReference(selectedNoteIds);
}


function updateNoteStateOnModificationCompletion(){
    refreshNoteModStartReference(selectedNoteIds);
    var changedNotes = selectedNoteIds.map(id => notes[id]).concat(Array.from(nonSelectedModifiedNotes).map(id => notes[id]));
    updateNoteInfoMultiple(changedNotes);
}

// attaches the appropriate handlers to the mouse event allowing to to 
// start a multi-select gesture (and later draw mode)
function attachHandlersOnBackground(backgroundElements_, svgParentObj){ 
    // need to listen on window so select gesture ends even if released outside the 
    // bounds of the root svg element or browser
    window.addEventListener('mouseup', function(event){
        //end a multi-select drag gesture
        if(selectRect) {
            selectRect.draw('stop', event);
            selectRect.remove();
            svgParentObj.off("mousemove");
            selectRect = null;
        }
        if(draggingActive){
            draggingActive = false;
            quantDragActivated = false;

            svgParentObj.off("mousemove");

            //used to prevent click events from triggering after drag
            dragTarget.motionOnDrag = checkIfNoteMovedSignificantly(dragTarget, 3);
            if(!dragTarget.motionOnDrag) return;

            //refresh the startReference so the next multi-select-transform works right
            updateNoteStateOnModificationCompletion();
            dragTarget = null;
        } 
        if(resizingActive){
            resizingActive= false;
            quantResizingActivated = false;

            svgParentObj.off("mousemove");

            if(!checkIfNoteResizedSignificantly(resizeTarget, 3)) return;
            console.log("resize done");

            resizeTarget.resize();

            updateNoteStateOnModificationCompletion();
            resizeTarget = null;
        }
    });

    backgroundElements_.forEach(function(elem){
        elem.on('mousedown', function(event){
            //clear previous mouse multi-select gesture state
            clearNoteSelection();

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
                        selectNote(noteElem);                        
                    } else {
                        deselectNote(noteElem)
                    }
                });
            })
        });

        elem.on('dblclick', function(event){
            var svgXY = svgMouseCoord(event);
            // svgXY = {x: event.clientX, y: event.clientY};
            var pitchPos = svgXYtoPitchPosQuant(svgXY.x, svgXY.y);
            addNote(pitchPos.pitch, pitchPos.position, 4/noteSubDivision, false);
        }); 
    });
}



function populateSpatialNoteTracker(){
    spatialNoteTracker = {};
    Object.values(notes).forEach(function(note){
        if(spatialNoteTracker[note.info.pitch]){
            spatialNoteTracker[note.info.pitch].push(note);
        } else {
            spatialNoteTracker[note.info.pitch] = [];
            spatialNoteTracker[note.info.pitch].push(note);
        }
    });
    Object.values(spatialNoteTracker).forEach(noteList => noteList.sort((a1, a2) => a1.info.position - a2.info.position));
}

var nonSelectedModifiedNotes = new Set();
var count = 0;

function executeOverlapVisibleChanges(){
    var currentlyModifiedNotes = new Set();
    selectedElements.forEach(function(selectedElem){
        var selectedNote = notes[selectedElem.noteId];
        var samePitch = spatialNoteTracker[selectedNote.info.pitch];
        if(samePitch) {
            samePitch.forEach(function(note){
                if(selectedElem.noteId != note.elem.noteId) {
                    if(selectedElements.has(note.elem)){
                        var earlierElem = note.elem.x() < selectedNote.elem.x() ? note : selectedNote;
                        var laterElem = note.elem.x() > selectedNote.elem.x() ? note : selectedNote; 



                    } else {

                        //truncating the end of the non-selected note
                        if(note.info.position < selectedNote.info.position && selectedNote.info.position < note.info.position+note.info.duration) {
                            if(count++ < 10) console.log(nonSelectedModifiedNotes, currentlyModifiedNotes, notesToRestore);
                            currentlyModifiedNotes.add(note.elem.noteId);
                            note.elem.show();
                            note.label.show();
                            note.elem.width((selectedNote.info.position - note.info.position)*quarterNoteWidth);
                        //deleting the non-selected note
                        } else if(selectedNote.info.position <= note.info.position && note.info.position < selectedNote.info.position+selectedNote.info.duration) {
                            currentlyModifiedNotes.add(note.elem.noteId);
                            note.elem.hide();
                            note.label.hide();
                        }
                    }
                }
            });
        }
    });
    var notesToRestore = nonSelectedModifiedNotes.difference(currentlyModifiedNotes);
    notesToRestore.forEach(id => updateNoteElement(notes[id]));
    nonSelectedModifiedNotes = currentlyModifiedNotes;
}


var quant = (val, qVal) => Math.floor(val/qVal) * qVal;
var quantRound = (val, qVal) => Math.round(val/qVal) * qVal;

var draggingActive = false;
var quantDragActivated = false;
var dragTarget = null;

var resizingActive = false;
var quantResizingActivated = false;
var resizeTarget = null;


function isDragOutOfBounds(){

}

function isResizeOutOfBounds(){

}

// sets event handlers on each note element for position/resize multi-select changes
function attachHandlersOnElement(noteElement, svgParentObj){
    
    /* Performs the same drag deviation done on the clicked element to 
     * the other selected elements
     */

    noteElement.on('point', function(event){ console.log("select", event)});

    noteElement.on('mousedown', function(event){
        if(!mouseScrollActive && !mouseZoomActive) {
            resetMouseMoveRoot(event);
            initializeNoteModificationAction(this);
            dragTarget = this;
            draggingActive = true;
            svgParentObj.on("mousemove", function(event){
                var svgXY = svgMouseCoord(event);
                var xMove;
                var xDevRaw = svgXY.x - mouseMoveRoot.svgX;
                var quantWidth = quarterNoteWidth * (4/noteSubDivision);
                if(Math.abs(svgXY.x - mouseMoveRoot.svgX) < quantWidth * 0.9 && !quantDragActivated) { 
                    xMove = xDevRaw;
                } else {
                    xMove = quantRound(xDevRaw, quantWidth);
                    quantDragActivated = true;
                }
                var yMove = quant(svgXY.y, noteHeight) - quant(mouseMoveRoot.svgY, noteHeight);
                selectedNoteIds.forEach(function(id){
                    notes[id].elem.x(noteModStartReference[id].x + xMove);
                    notes[id].elem.y(noteModStartReference[id].y + yMove);
                    notes[id].label.x(noteModStartReference[id].x + xMove + textDev);
                    notes[id].label.y(noteModStartReference[id].y + yMove);
                    notes[id].label.text(svgYToPitchString(notes[id].label.y()));
                    updateNoteInfo(notes[id], true);
                });
                executeOverlapVisibleChanges();
            });
        }
    });

    noteElement.on('resizestart', function(event){
        initializeNoteModificationAction(this);

        //extracting the base dom-event from the SVG.js event so we can snapshot the current mouse coordinates
        resetMouseMoveRoot(event.detail.event.detail.event);

        //inProgress - to get reizing to work with inter-select overlap and to stop resizing of 
        //clicked element at the start of another selected element, might need to remove the resize
        //handlers of all of the selected elements here, calculate the resize using 'mousemove' info 
        //by moving 'resizing' handler logic to 'mousemove', and then on 'mouseup' reattaching 'resize'
        //handler (at least, for 'resizestart' to piggyback on the gesture detection).
        resizeTarget = this;
        this.resize('stop');
        resizingActive = true;
        svgParentObj.on('mousemove', function(event){
            var svgXY = svgMouseCoord(event);
            var xMove;
            var xDevRaw = svgXY.x - mouseMoveRoot.svgX;
            var oldX = noteModStartReference[resizeTarget.noteId].x;
            var isEndChange = resizeTarget.x() === oldX; //i.e, whehter you're moving the "start" or "end" of the note
            selectedNoteIds.forEach(function(id){
                var oldNoteVals = noteModStartReference[id];
                //inProgress - control the resizing/overlap of the selected elements here and you don't 
                //have to worry about them in executeOverlapVisibleChanges()

                if(isEndChange) { 
                    notes[id].elem.width(oldNoteVals.width + xDevRaw);
                } else { 
                    notes[id].elem.width(oldNoteVals.width - xDevRaw);
                    notes[id].elem.x(oldNoteVals.x + xDevRaw);
                }
                updateNoteInfo(notes[id], true);
            });
            executeOverlapVisibleChanges();
        })
    });

    // noteElement.on('click', function(event){
    //     if(!this.motionOnDrag) {
    //         if(!shiftKeyDown) clearNoteSelection();
    //         console.log("shiftKeyDown on click", shiftKeyDown);
    //         selectNote(this);
    //     }
    // });

    noteElement.on('dblclick', function(event){
        deleteNotes([this]);
    })
}


function selectNote(noteElem){
    if(!selectedElements.has(noteElem)) {
        selectedElements.add(noteElem);
        noteElem.fill(selectedNoteColor);
    }
}

function deselectNote(noteElem){
    if(selectedElements.has(noteElem)) {
        selectedElements.delete(noteElem);
        noteElem.fill(noteColor);
    }
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
    return returnVal;
}

function clearNoteSelection(){
    selectedElements.forEach(noteElem => deselectNote(noteElem));
}

/*
WORKING BUG LOG 
- X prefix means good workaround found, but the "common sense" approach still fails and idk why



*/


