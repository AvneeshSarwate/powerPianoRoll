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
        - handle drag quantizing so that clicked note snaps to grid when moved large distances
    - need to handle out-of-bounds dragging
    - handling overlaps on resizing, drag and doubleclick-to-add-note
        - resizing quantization should be triggered once the end nears a note-section border. currently it quantizes
          once the deviation distance is near the quanization length
        - in general - if selected/new notes intersect with start start of "other" note, the "other" note is deleted,
          and if they intersect with the end of "other" notes, the "other" notes are truncated.
          - The exception is if a selected note is resized into another selected note, in which case the resizing is 
            truncated at the start of the next selected note
- X implement showing note names on notes
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


/*
General organization - 
Look at attachHandlersOnBackground to see how notes are drawn/created.
Look at attachHandlersOnElement to see how notes can be moved and modified. 

Basic strategy for implementing multi-note modifications - 
- Define the "target" element (the one the mouse gestures are happening on) and
  the other "selected" elements. 
- Calulate the mouse motion/deviation from the mousedown point on the target element
- Use this mouse deviation info to control movement/resizing of all selected elements



*/

class PianoRoll {
    constructor(containerElementId){
        this.svgRoot; //the svg root element

        /* a dictionary that, upon the start of a group drag/resize event, stores the 
         * initial positions and lengths of all notes so that the mouse modifications to
         * one note can be bounced to the rest of the selected notes*/
        this.noteModStartReference;

        //structure tracking both note info and note svg element state
        this.notes = {};


        //used to track note show/hide on resize/drag - map of pitch -> noteInfo of that pitch sorted by start time
        this.spatialNoteTracker = {}

        //elements selected by a mouse-region highlight
        this.selectedElements = new Set();
        selectedNoteIds = []; //IDs of selected notes saved separtely to speed up multi drag/resize performance

        selectRect; //the variable holding the mouse-region highlight svg rectabgle 

        //svg elements in the pianoRoll background
        backgroundElements;



        quarterNoteWidth = 120; //in pixels
        noteHeight = 20; //in pixels
        whiteNotes = [0, 2, 4, 5, 7, 9, 11];
        noteSubDivision = 16; //where to draw lines and snap to grid
        timeSignature = 4/4; //b
        numMeasures = 100;
        // Every quarter note region of the background will be alternately colored.
        // In ableton this changes on zoom level
        sectionColoringDivision = 4; 
        NUM_MIDI_NOTES = 128;

        //snap to grid quantization sizes
        xSnap = 1; //x-variable will change depending on user quantization choice, or be vertLineSpace as calculated below
        ySnap = noteHeight;

        backgroundColor1 = '#ddd';
        backgroundColor2 = '#bbb';
        noteColor = '#f23';
        selectedNoteColor = '#2ee'
        thickLineWidth = 1.8;
        thinLineWidth = 1;
        viewportHeight = 720;
        viewportWidth = 1280;
        maxZoom;
        noteCount = 0;
        // Create an SVGPoint for future math
        refPt; 
        shiftKeyDown = false;


        historyList = [[]]; //list of states. upon an edit, the end of historyList is always the current state 

        // How far away from end of array (e.g, how many redos available).
        //  historyListIndex  is always the index of the current state in historyList
        historyListIndex = 0; 

        pianoRollHeight;
        pianoRollWidth;

        //variables relating to note-name labels
        pitchStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        textDev = 4;

        //variables relating to mouse movement state (scroll, zoom, resize, drag, etc)
        mouseScrollActive = false;
        mouseZoomActive = false;
        mouseMoveRootNeedsReset = true;
        mouseMoveRoot = {x: -1, y: -1};

        //notes that are modified during drag or resize because they overlap with selected notes
        nonSelectedModifiedNotes = new Set();
        count = 0; //some debugging variable

        draggingActive = false;
        quantDragActivated = false;
        dragTarget = null;

        resizingActive = false;
        quantResizingActivated = false;
        resizeTarget = null;
    }

    drawBackground() {
        pianoRollHeight = noteHeight * NUM_MIDI_NOTES;
        var pulsesPerMeasure = timeSignature * 4;
        pianoRollWidth = quarterNoteWidth * pulsesPerMeasure * numMeasures;
        var numVertLines = numMeasures * pulsesPerMeasure * (noteSubDivision / 4);
        var vertLineSpace = pianoRollWidth / numVertLines;
        xSnap = vertLineSpace;
        var measureWidth = quarterNoteWidth*pulsesPerMeasure;
        this.svgRoot = SVG('drawing').attr('id', 'pianoRollSVG').size(viewportWidth, viewportHeight);
        refPt = this.svgRoot.node.createSVGPoint();
        maxZoom = viewportHeight / pianoRollHeight;

        backgroundElements = new Set();
        for(var i = 0; i < numMeasures; i++){
            var color = i % 2 == 0 ? backgroundColor1 : backgroundColor2;
            var panel = this.svgRoot.rect(measureWidth, pianoRollHeight).move(i*measureWidth, 0).fill(color);
            backgroundElements.add(panel);
        }
        for(var i = 1; i < numVertLines; i++){
            var xPos = i*vertLineSpace;
            var strokeWidth = xPos % quarterNoteWidth == 0 ? thickLineWidth : thinLineWidth;
            var line = this.svgRoot.line(xPos, 0, xPos, pianoRollHeight).stroke({width: strokeWidth});
            backgroundElements.add(line);
        }
        for(var i = 1; i < NUM_MIDI_NOTES; i++){
            var line = this.svgRoot.line(0, i*noteHeight, pianoRollWidth, i*noteHeight).stroke({width: thinLineWidth});
            backgroundElements.add(line);
        }
    }


    //duration is number of quarter notes, pitch is 0-indexed MIDI
    addNote(pitch, position, duration, isHistoryManipulation){
        var rect = this.svgRoot.rect(duration*quarterNoteWidth, noteHeight).move(position*quarterNoteWidth, (127-pitch)*noteHeight).fill(noteColor);;
        rect.noteId = noteCount;
        rect.selectize({rotationPoint: false, points:["r", "l"]}).resize();
        var text = this.svgRoot.text(svgYToPitchString(rect.y()))
            .font({size: 14})
            .move(position*quarterNoteWidth + textDev, (127-pitch)*noteHeight)
            .style('pointer-events', 'none');
        attachHandlersOnElement(rect, this.svgRoot);
        this.notes[noteCount] = {
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

    deleteElement(elem){
        elem.selectize(false);
        elem.remove();
        this.notes[elem.noteId].label.remove();
    }

    deleteNotes(elements){
        //for selected notes - delete svg elements, remove entries from "notes" objects
        elements.forEach(function(elem){
            deleteElement(elem);
            delete this.notes[elem.noteId];
        });
        snapshotNoteState();
    }

    //update underlying note info from SVG element change
    updateNoteInfo(note, calledFromBatchUpdate){
        if(note.elem.visible()) {
            var pitch = svgYtoPitch(note.elem.y());
            var position = svgXtoPosition(note.elem.x());
            var duration = note.elem.width()/quarterNoteWidth;
            note.info = {pitch, position, duration};
        } else {
            deleteElement(note.elem);
            delete this.notes[note.elem.noteId];
        }
        if(!calledFromBatchUpdate) snapshotNoteState();
    }

    //a separate function so that batch note changes are saved in the undo history as a single event
    updateNoteInfoMultiple(notes){
        notes.forEach(note => updateNoteInfo(note, true));
        snapshotNoteState();
    }

    //update note SVG element from underlying info change
    updateNoteElement(note){
        note.elem.show();
        note.elem.x(note.info.position * quarterNoteWidth);
        note.elem.y((127-note.info.pitch)*noteHeight);
        note.elem.width(note.info.duration*quarterNoteWidth);
        note.label.x(note.info.position * quarterNoteWidth + textDev);
        note.label.y((127-note.info.pitch)*noteHeight);
        note.label.text(svgYToPitchString(note.label.y()));
    }

    // Get point in global SVG space from mousemove event
    svgMouseCoord(evt){
      refPt.x = evt.clientX; 
      refPt.y = evt.clientY;
      return refPt.matrixTransform(this.svgRoot.node.getScreenCTM().inverse());
    }

    svgYtoPitch(yVal) {return 127 - yVal/noteHeight;}
    svgXtoPosition(xVal) {return xVal/quarterNoteWidth}
    svgXYtoPitchPos(xVal, yVal){
        return {pitch: 127 - yVal/noteHeight, position: xVal/quarterNoteWidth};
    }
    svgXYtoPitchPosQuant(xVal, yVal) {
        var notesPerQuarterNote = noteSubDivision/4;
        var rawPosition = xVal / quarterNoteWidth;
        return {pitch: 127 - Math.floor(yVal/noteHeight), position: Math.floor(rawPosition * notesPerQuarterNote)/notesPerQuarterNote};
    }


    // need to calculate mouse delta from screen coordinates rather than SVG coordinates because
    // the SVG view moves after every frame, thus changing the read mouse coordintates and creating
    // wild feedback. root is the mouse position "snapshot" against which the delta is measured
    getMouseDelta(event, root){
        return {x: event.clientX - root.mouseX, y: event.clientY - root.mouseY};
    }

    //take a snapshot of the mouse position and viewbox size/position
    resetMouseMoveRoot(event){
        var vb = this.svgRoot.viewbox();
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

    mouseScrollHandler(event){
        if(mouseMoveRootNeedsReset) resetMouseMoveRoot(event);
        if(mouseScrollActive){
            var mouseDetla = getMouseDelta(event, mouseMoveRoot);
            var boundVal = (n, l, h) => Math.min(h, Math.max(l, n));
            
            //inverted scrolling
            var scrollFactor = 1/mouseMoveRoot.zoom;
            var newVBPos = {
                x: boundVal(mouseMoveRoot.vbX - mouseDetla.x * scrollFactor, 0, pianoRollWidth - mouseMoveRoot.vbWidth),
                y: boundVal(mouseMoveRoot.vbY - mouseDetla.y * scrollFactor, 0, pianoRollHeight - mouseMoveRoot.vbHeight)
            };
            this.svgRoot.viewbox(newVBPos.x, newVBPos.y, mouseMoveRoot.vbWidth, mouseMoveRoot.vbHeight);
        }
    }

    mouseZoomHandler(event){
        if(mouseMoveRootNeedsReset) resetMouseMoveRoot(event);
        if(mouseZoomActive){
            var mouseDetla = getMouseDelta(event, mouseMoveRoot);
            var boundVal = (n, l, h) => Math.min(h, Math.max(l, n));

            var zoomChange = (4**(mouseDetla.y/mouseMoveRoot.zoom / mouseMoveRoot.vbHeight));
            var zoomFactor = mouseMoveRoot.zoom * zoomChange;
            if(zoomFactor < maxZoom) return;
            
            var svgMouseVBOffsetX = mouseMoveRoot.svgX - mouseMoveRoot.vbX;
            var svgMouseVBOffsetY = mouseMoveRoot.svgY - mouseMoveRoot.vbY;
            var newWidth = mouseMoveRoot.vbWidth/zoomChange;
            var newHeight = mouseMoveRoot.vbHeight/zoomChange;
            var newVBPos = {
                x: boundVal(mouseMoveRoot.svgX - svgMouseVBOffsetX/zoomChange, 0, pianoRollWidth - newWidth),
                y: boundVal(mouseMoveRoot.svgY - svgMouseVBOffsetY/zoomChange, 0, pianoRollHeight - newHeight)
            };

            this.svgRoot.viewbox(newVBPos.x, newVBPos.y, newWidth, newHeight);
        }
    }

    keydownHandler(event){
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
            deleteNotes(this.selectedElements);
            event.stopPropagation();
        }
        if(event.key === "z" && event.metaKey){
            if(shiftKeyDown) executeRedo();
            else executeUndo();
        }
    }

    keyupHandler(event){
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

    snapshotNoteState(){
        console.log("snapshot", historyList.length, historyListIndex);
        var noteState = Object.values(this.notes).map(note => note.info);
        if(historyListIndex == historyList.length-1){
            historyList.push(noteState);
        } else {
            historyList = historyList.splice(0, historyListIndex+1);
            historyList.push(noteState);
        }
        historyListIndex++;
    }

    executeUndo() {
        if(historyListIndex == 0) return; //always start with an "no-notes" state
        historyListIndex--;
        restoreNoteState(historyListIndex);
    }

    executeRedo() {
        if(historyListIndex == historyList.length-1) return;
        historyListIndex++;
        restoreNoteState(historyListIndex);
    }

    restoreNoteState(histIndex){
        Object.values(this.notes).forEach(note => deleteElement(note.elem));
        this.notes = {};
        var noteState = historyList[histIndex];
        noteState.forEach(function(noteInfo){
            addNote(noteInfo.pitch, noteInfo.position, noteInfo.duration, true);
        });
    }

    svgYToPitchString(yVal){
        var pitch = svgYtoPitch(yVal);
        return pitchStrings[pitch%12] + (Math.floor(pitch/12)-2);
    }

    //function that snapes note svg elements into place
    snapPositionToGrid(elem, xSize, ySize){
        elem.x(Math.round(elem.x()/xSize) * xSize);
        elem.y(Math.round(elem.y()/ySize) * ySize); //because we're using lines instead of rectangles
        var label = this.notes[elem.noteId].label;
        label.x(Math.round(elem.x()/xSize) * xSize + textDev);
        label.y(Math.round(elem.y()/ySize) * ySize); //because we're using lines instead of rectangles
        label.text(svgYToPitchString(label.y()));
    }

    // Resets the "start" positions/sizes of notes for multi-select transformations to current position/sizes
    refreshNoteModStartReference(noteIds){
        this.noteModStartReference = {};
        noteIds.forEach(function(id){ 
            this.noteModStartReference[id] = {
                x:  this.notes[id].elem.x(), 
                y:  this.notes[id].elem.y(), 
                width: this.notes[id].elem.width(), 
                height: this.notes[id].elem.height()
            };
        });
    }


    //used to differentiate between "clicks" and "drags" from a user perspective
    //to stop miniscule changes from being added to undo history
    checkIfNoteMovedSignificantly(noteElement, thresh){
        return Math.abs(noteElement.x() - this.noteModStartReference[noteElement.noteId].x) > thresh || Math.abs(noteElement.y() - this.noteModStartReference[noteElement.noteId].y) > thresh;
    }

    //used to differentiate between "clicks" and "resize" from a user perspective 
    //to stop miniscule changes from being added to undo history
    checkIfNoteResizedSignificantly(noteElement, thresh){
        return Math.abs(noteElement.width() - this.noteModStartReference[noteElement.noteId].width) > thresh;
    }

    initializeNoteModificationAction(element){
        selectedNoteIds = Array.from(this.selectedElements).map(elem => elem.noteId);
        nonSelectedModifiedNotes.clear();
        if(!selectedNoteIds.includes(element.noteId)) {
            if(!shiftKeyDown) clearNoteSelection();
            selectNote(element);
            selectedNoteIds = [element.noteId];
        }
        populateSpatialNoteTracker();
        refreshNoteModStartReference(selectedNoteIds);
    }


    updateNoteStateOnModificationCompletion(){
        refreshNoteModStartReference(selectedNoteIds);
        var changedNotes = selectedNoteIds.map(id => this.notes[id]).concat(Array.from(nonSelectedModifiedNotes).map(id => this.notes[id]));
        updateNoteInfoMultiple(changedNotes);
    }


    endSelect(){
        selectRect.draw('stop', event);
        selectRect.remove();
        this.svgRoot.off("mousemove");
        selectRect = null;
    }

    endDrag(){
        draggingActive = false;
        quantDragActivated = false;

        this.svgRoot.off("mousemove");

        //used to prevent click events from triggering after drag
        dragTarget.motionOnDrag = checkIfNoteMovedSignificantly(dragTarget, 3);
        if(!dragTarget.motionOnDrag) return;

        //refresh the startReference so the next multi-select-transform works right
        updateNoteStateOnModificationCompletion();
        dragTarget = null;
    }

    endResize(){
        resizingActive= false;
        quantResizingActivated = false;

        this.svgRoot.off("mousemove");

        if(!checkIfNoteResizedSignificantly(resizeTarget, 3)) return;
        console.log("resize done");

        resizeTarget.resize();

        updateNoteStateOnModificationCompletion();
        resizeTarget = null;
    }

    startDragSelection(){
        //clear previous mouse multi-select gesture state
        clearNoteSelection();

        //restart new mouse multi-select gesture
        selectRect = this.svgRoot.rect().fill('#008').attr('opacity', 0.25);
        selectRect.draw(event);
        this.svgRoot.on("mousemove", function(event){
            
            //select this.notes which intersect with the selectRect (mouse selection area)
            Object.keys(this.notes).forEach(function(noteId){
                var noteElem = this.notes[noteId].elem;
                
                // var intersecting = svgParentObj.node.checkIntersection(noteElem.node, selectRect.node.getBBox());
                var intersecting = selectRectIntersection(selectRect, noteElem);
                if(intersecting) {
                    selectNote(noteElem);                        
                } else {
                    deselectNote(noteElem)
                }
            });
        });
    }

    // attaches the appropriate handlers to the mouse event allowing to to 
    // start a multi-select gesture (and later draw mode)
    attachHandlersOnBackground(backgroundElements_, svgParentObj){ 
        // need to listen on window so select gesture ends even if released outside the 
        // bounds of the root svg element or browser
        window.addEventListener('mouseup', function(event){
            //end a multi-select drag gesture
            if(selectRect) {
                endSelect();
            }
            if(draggingActive){
                endDrag();
            } 
            if(resizingActive){
                endResize();
            }
        });

        backgroundElements_.forEach(function(elem){
            elem.on('mousedown', function(event){
                startDragSelection();
            });

            elem.on('dblclick', function(event){
                var svgXY = svgMouseCoord(event);
                var pitchPos = svgXYtoPitchPosQuant(svgXY.x, svgXY.y);
                addNote(pitchPos.pitch, pitchPos.position, 4/noteSubDivision, false);
            }); 
        });
    }



    populateSpatialNoteTracker(){
        this.spatialNoteTracker = {};
        Object.values(this.notes).forEach(function(note){
            if(this.spatialNoteTracker[note.info.pitch]){
                this.spatialNoteTracker[note.info.pitch].push(note);
            } else {
                this.spatialNoteTracker[note.info.pitch] = [];
                this.spatialNoteTracker[note.info.pitch].push(note);
            }
        });
        Object.values(this.spatialNoteTracker).forEach(noteList => noteList.sort((a1, a2) => a1.info.position - a2.info.position));
    }

    executeOverlapVisibleChanges(){
        var currentlyModifiedNotes = new Set();
        this.selectedElements.forEach(function(selectedElem){
            var selectedNote = this.notes[selectedElem.noteId];
            var samePitch = this.spatialNoteTracker[selectedNote.info.pitch];
            if(samePitch) {
                samePitch.forEach(function(note){
                    if(selectedElem.noteId != note.elem.noteId) {
                        if(this.selectedElements.has(note.elem)){
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
        notesToRestore.forEach(id => updateNoteElement(this.notes[id]));
        nonSelectedModifiedNotes = currentlyModifiedNotes;
    }


    isDragOutOfBounds(){

    }

    isResizeOutOfBounds(){

    }

    // sets event handlers on each note element for position/resize multi-select changes
    attachHandlersOnElement(noteElement, svgParentObj){
        
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
                    var quant = (val, qVal) => Math.floor(val/qVal) * qVal;
                    var quantRound = (val, qVal) => Math.round(val/qVal) * qVal;
                    
                    if(Math.abs(svgXY.x - mouseMoveRoot.svgX) < quantWidth * 0.9 && !quantDragActivated) { 
                        xMove = xDevRaw;
                    } else {
                        xMove = quantRound(xDevRaw, quantWidth);
                        quantDragActivated = true;
                    }
                    var yMove = quant(svgXY.y, noteHeight) - quant(mouseMoveRoot.svgY, noteHeight);
                    selectedNoteIds.forEach(function(id){
                        var noteModStart = this.noteModStartReference[id];
                        //postponed - make note quantization more like ableton's on drag
                        this.notes[id].elem.x(noteModStart.x + xMove);
                        this.notes[id].elem.y(noteModStart.y + yMove);
                        this.notes[id].label.x(noteModStart.x + xMove + textDev);
                        this.notes[id].label.y(noteModStart.y + yMove);
                        this.notes[id].label.text(svgYToPitchString(this.notes[id].label.y()));
                        updateNoteInfo(this.notes[id], true);
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
                var oldX = this.noteModStartReference[resizeTarget.noteId].x;
                var isEndChange = resizeTarget.x() === oldX; //i.e, whehter you're moving the "start" or "end" of the note
                selectedNoteIds.forEach(function(id){
                    var oldNoteVals = this.noteModStartReference[id];
                    //inProgress - control the resizing/overlap of the selected elements here and you don't 
                    //have to worry about them in executeOverlapVisibleChanges()

                    //inProgress - quantize long drags
                    if(isEndChange) { 
                        this.notes[id].elem.width(oldNoteVals.width + xDevRaw);
                    } else { 
                        this.notes[id].elem.width(oldNoteVals.width - xDevRaw);
                        this.notes[id].elem.x(oldNoteVals.x + xDevRaw);
                        this.notes[id].label.x(oldNoteVals.x + xDevRaw);
                    }
                    updateNoteInfo(this.notes[id], true);
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


    selectNote(noteElem){
        if(!this.selectedElements.has(noteElem)) {
            this.selectedElements.add(noteElem);
            noteElem.fill(selectedNoteColor);
        }
    }

    deselectNote(noteElem){
        if(this.selectedElements.has(noteElem)) {
            this.selectedElements.delete(noteElem);
            noteElem.fill(noteColor);
        }
    }

    // calculates if a note intersects with the mouse-multiselect rectangle
    selectRectIntersection(selectRect_, noteElem){
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
    boxIntersect(noteBox, selectBox){
        var returnVal = true;
        //if noteBox is full to the left or right of select box
        if(noteBox.br.x < selectBox.tl.x || noteBox.tl.x > selectBox.br.x) returnVal = false;

        //if noteBox is fully below or above rect box
        //comparison operators are wierd because image coordinates used e.g (0,0) at "upper left" of positive quadrant
        if(noteBox.tl.y > selectBox.br.y || noteBox.br.y < selectBox.tl.y) returnVal = false;
        return returnVal;
    }

    clearNoteSelection(){
        this.selectedElements.forEach(noteElem => deselectNote(noteElem));
    }
}

SVG.on(document, 'DOMContentLoaded', function() {

    drawBackground();

    // attach the interaction handlers not related to individual notes
    attachHandlersOnBackground(backgroundElements, this.svgRoot);

    addNote(120, 0, 1, false);
    addNote(115, 0, 1, false);


    //set the view-area so we aren't looking at the whole 127 note 100 measure piano roll
    this.svgRoot.viewbox(0, 0, viewportWidth, viewportHeight);

    // setMouseMovementHandlers(this.svgRoot);

    $('#drawing').keydown(keydownHandler);
    $('#drawing').keyup(keyupHandler);
});

/*
WORKING BUG LOG 
- X prefix means good workaround found, but the "common sense" approach still fails and idk why



*/


