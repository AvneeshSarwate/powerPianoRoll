'use strict';
/*
basic strategy for using SVG:
In SVG you can draw on an arbitrarily large plane and have a 'viewbox' that shows a sub-area of that.
Because of this, for a piano roll, you can 'draw' a piano-roll at an arbitrary size and move around
the viewbox rather than 'redrawing' the piano roll when you want to zoom/move. What's TBD is to see
how annoying it might be to program selecting/dragging/highlighting/resizing with this approach. 
In general, aiming for Ableton piano-roll feature parity wrt mouse interaction (assuming keyboard 
shortcuts are trivial to implement if you can get the mouse stuff right)

order of library features to test (for each, make sure they're sensible under viewbox zoom too):
NOTE - this is only a test of INTERACTIONS - the look is ugly and the code is organized for quick hacking.
How note-state <-> note-svg-elements is handled is still TBD. 

- X - dragging behavior 
- X - dragging and snap to grid
    - NOTE - clicking on a note is interpeted as a 'drag' and will automatically quantize it (see bugs below)
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
        - in general - if selected/new notes intersect with start start of 'other' note, the 'other' note is deleted,
          and if they intersect with the end of 'other' notes, the 'other' notes are truncated.
          - The exception is if a selected note is resized into another selected note, in which case the resizing is 
            truncated at the start of the next selected note
- X implement showing note names on notes
- implement cursor and cut/copy/paste
- implement moving highlighted notes by arrow click 
- figure out floating note names on side and time-values on top 
- figure out cursor animation and viewbox movement for a playing piano roll
- decide how to do ableton 'draw mode' style interaction (shouldn't require any new funky 
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
- Define the 'target' element (the one the mouse gestures are happening on) and
  the other 'selected' elements. 
- Calulate the mouse motion/deviation from the mousedown point on the target element
- Use this mouse deviation info to control movement/resizing of all selected elements
*/

class PianoRoll {
    constructor(containerElementId, playHandler, noteOnOffHandler){
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
        this.selectedNoteIds = []; //IDs of selected notes saved separtely to speed up multi drag/resize performance

        this.selectRect; //the variable holding the mouse-region highlight svg rectabgle 

        this.cursorElement; //cursor that corresponds to interaction and editing
        this.cursorPosition = 0.25; //cursor position is in beats
        this.cursorWidth = 2.1; 

        this.playCursorElement; //cursor that moves when piano roll is being played

        //svg elements in the pianoRoll background
        this.backgroundElements;

        this.quarterNoteWidth = 120; //in pixels
        this.noteHeight = 20; //in pixels
        this.whiteNotes = [0, 2, 4, 5, 7, 9, 11];
        this.noteSubDivision = 16; //where to draw lines and snap to grid
        this.timeSignature = 4/4; //b
        this.numMeasures = 100;
        // Every quarter note region of the background will be alternately colored.
        // In ableton this changes on zoom level - TODO - is this even used? Could ignore this behavior
        this.sectionColoringDivision = 4; 
        this.NUM_MIDI_NOTES = 128;

        //snap to grid quantization sizes
        this.xSnap = 1; //x-variable will change depending on user quantization choice, or be vertLineSpace as calculated below
        this.ySnap = this.noteHeight;

        this.backgroundColor1 = '#ddd';
        this.backgroundColor2 = '#bbb';
        this.noteColor = '#f23';
        this.selectedNoteColor = '#2ee'
        this.thickLineWidth = 1.8;
        this.thinLineWidth = 1;
        this.viewportHeight = 720;
        this.viewportWidth = 1280;
        this.maxZoom;
        this.noteCount = 0;
        // Create an SVGPoint for future math
        this.refPt; 
        this.shiftKeyDown = false;


        this.historyList = [[]]; //list of states. upon an edit, the end of historyList is always the current state 

        // How far away from end of array (e.g, how many redos available).
        //  historyListIndex  is always the index of the current state in historyList
        this.historyListIndex = 0; 

        this.pianoRollHeight;
        this.pianoRollWidth;

        //variables relating to note-name labels
        this.pitchStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.textDev = 4;

        //variables relating to mouse movement state (scroll, zoom, resize, drag, etc)
        this.mouseScrollActive = false;
        this.mouseZoomActive = false;
        this.mouseMoveRootNeedsReset = true;
        this.mouseMoveRoot = {x: -1, y: -1};

        //notes that are modified during drag or resize because they overlap with selected notes
        this.nonSelectedModifiedNotes = new Set();
        this.count = 0; //some debugging variable

        this.draggingActive = false;
        this.quantDragActivated = false;
        this.dragTarget = null;

        this.resizingActive = false;
        this.quantResizingActivated = false;
        this.resizeTarget = null;

        //used to get around scope/'this' issues - for drag/resize handlers we have access to raw 
        //svg element but need the SVG.js wrapper 
        this.rawSVGElementToWrapper = {}; 

        this.copiedNoteBuffer = [];

        this.containerElement = document.getElementById(containerElementId);
        this.containerElement.tabIndex = 0;
        this.containerElementId = containerElementId;

        this.temporaryMouseMoveHandler = null; //variable used to manage logic for various mouse-drag gestures
        this.mousePosition = {x: 0, y: 0}; //current position of mouse in SVG coordinates
        
        //callback to play notes when selected/moved/etc. Takes a single pitch argument
        this.playHandler = playHandler; 

        //handler for separate on/off actions. takes a pitch val and on/off string
        this.noteOnOffHandler = noteOnOffHandler;


        this.drawBackgroundAndCursor();

        // attach the interaction handlers not related to individual notes
        this.attachHandlersOnBackground(this.backgroundElements, this.svgRoot);

        this.addNote(55, 0, 1, false);
        this.addNote(60, 0, 1, false);


        //set the view-area so we aren't looking at the whole 127 note 100 measure piano roll
        this.svgRoot.viewbox(0, 55*this.noteHeight, this.viewportWidth, this.viewportHeight);

        this.containerElement.addEventListener('keydown', event => this.keydownHandler(event));
        this.containerElement.addEventListener('keyup', event => this.keyupHandler(event));
        this.containerElement.addEventListener('mousemove', event => {
                this.mousePosition = this.svgMouseCoord(event);
            });
    }

    drawBackgroundAndCursor() {
        this.pianoRollHeight = this.noteHeight * this.NUM_MIDI_NOTES;
        let pulsesPerMeasure = this.timeSignature * 4;
        this.pianoRollWidth = this.quarterNoteWidth * pulsesPerMeasure * this.numMeasures;
        let numVertLines = this.numMeasures * pulsesPerMeasure * (this.noteSubDivision / 4);
        let vertLineSpace = this.pianoRollWidth / numVertLines;
        this.xSnap = vertLineSpace;
        let measureWidth = this.quarterNoteWidth*pulsesPerMeasure;
        this.svgRoot = SVG(this.containerElementId).attr('id', 'pianoRollSVG').size(this.viewportWidth, this.viewportHeight);
        this.refPt = this.svgRoot.node.createSVGPoint();
        this.maxZoom = this.viewportHeight / this.pianoRollHeight;

        this.backgroundElements = new Set();
        for(let i = 0; i < this.numMeasures; i++){
            let color = i % 2 == 0 ? this.backgroundColor1 : this.backgroundColor2;
            let panel = this.svgRoot.rect(measureWidth, this.pianoRollHeight).move(i*measureWidth, 0).fill(color);
            this.backgroundElements.add(panel);
        }
        for(let i = 1; i < numVertLines; i++){
            let xPos = i*vertLineSpace;
            let strokeWidth = xPos % this.quarterNoteWidth == 0 ? this.thickLineWidth : this.thinLineWidth;
            let line = this.svgRoot.line(xPos, 0, xPos, this.pianoRollHeight).stroke({width: strokeWidth});
            this.backgroundElements.add(line);
        }
        for(let i = 1; i < this.NUM_MIDI_NOTES; i++){
            let line = this.svgRoot.line(0, i*this.noteHeight, this.pianoRollWidth, i*this.noteHeight).stroke({width: this.thinLineWidth});
            this.backgroundElements.add(line);
        }

        this.cursorElement = this.svgRoot.rect(this.cursorWidth, this.pianoRollHeight).move(this.cursorPosition * this.quarterNoteWidth, 0).fill(this.noteColor);
        this.playCursorElement = this.svgRoot.rect(this.cursorWidth, this.pianoRollHeight).move(this.cursorPosition * this.quarterNoteWidth, 0).fill('#2d2').opacity(0);
        this.cursorElement.animate(1500, '<>').attr({fill: '#fff'}).loop(Infinity, true);
    }


    //duration is number of quarter notes, pitch is 0-indexed MIDI
    addNote(pitch, position, duration, avoidHistoryManipulation){
        let rect = this.svgRoot.rect(duration*this.quarterNoteWidth, this.noteHeight).move(position*this.quarterNoteWidth, (127-pitch)*this.noteHeight).fill(this.noteColor);
        this.rawSVGElementToWrapper[rect.node.id] = rect;
        rect.noteId = this.noteCount;
        rect.selectize({rotationPoint: false, points:['r', 'l']}).resize();
        let text = this.svgRoot.text(this.svgYToPitchString(rect.y()))
            .font({size: 14})
            .move(position*this.quarterNoteWidth + this.textDev, (127-pitch)*this.noteHeight)
            .style('pointer-events', 'none');
        this.attachHandlersOnElement(rect, this.svgRoot);
        this.notes[this.noteCount] = {
            elem: rect, 
            info: {pitch, position, duration},
            label: text
        }
        this.noteCount++;
        if(!avoidHistoryManipulation){
            this.snapshotNoteState();
        }

        this.playHandler(pitch);

        return rect.noteId;
    }

    deleteElement(elem){
        elem.selectize(false);
        elem.remove();
        this.notes[elem.noteId].label.remove();
    }

    deleteNotes(elements){
        //for selected notes - delete svg elements, remove entries from 'notes' objects
        elements.forEach((elem)=>{
            this.deleteElement(elem);
            delete this.notes[elem.noteId];
        });
        this.snapshotNoteState();
    }

    //update underlying note info from SVG element change
    updateNoteInfo(note, calledFromBatchUpdate){
        if(note.elem.visible()) {
            let pitch = this.svgYtoPitch(note.elem.y());
            let position = this.svgXtoPosition(note.elem.x());
            let duration = note.elem.width()/this.quarterNoteWidth;
            note.info = {pitch, position, duration};
        } else {
            this.deleteElement(note.elem);
            delete this.notes[note.elem.noteId];
        }
        if(!calledFromBatchUpdate) this.snapshotNoteState();
    }

    //a separate function so that batch note changes are saved in the undo history as a single event
    updateNoteInfoMultiple(notes){
        notes.forEach(note => this.updateNoteInfo(note, true));
        this.snapshotNoteState();
    }

    //update note SVG element from underlying info change
    updateNoteElement(note){
        note.elem.show();
        note.elem.x(note.info.position * this.quarterNoteWidth);
        note.elem.y((127-note.info.pitch)*this.noteHeight);
        note.elem.width(note.info.duration*this.quarterNoteWidth);
        note.label.show();
        note.label.x(note.info.position * this.quarterNoteWidth + this.textDev);
        note.label.y((127-note.info.pitch)*this.noteHeight);
        note.label.text(this.svgYToPitchString(note.label.y()));
    }

    // Get point in global SVG space from mousemove event
    svgMouseCoord(evt){
      this.refPt.x = evt.clientX; 
      this.refPt.y = evt.clientY;
      return this.refPt.matrixTransform(this.svgRoot.node.getScreenCTM().inverse());
    }

    svgYtoPitch(yVal) {return 127 - yVal/this.noteHeight;}
    svgXtoPosition(xVal) {return xVal/this.quarterNoteWidth}
    svgXYtoPitchPos(xVal, yVal){
        return {pitch: 127 - yVal/this.noteHeight, position: xVal/this.quarterNoteWidth};
    }
    svgXYtoPitchPosQuant(xVal, yVal) {
        let notesPerQuarterNote = this.noteSubDivision/4;
        let rawPosition = xVal / this.quarterNoteWidth;
        return {pitch: 127 - Math.floor(yVal/this.noteHeight), position: Math.floor(rawPosition * notesPerQuarterNote)/notesPerQuarterNote};
    }


    // need to calculate mouse delta from screen coordinates rather than SVG coordinates because
    // the SVG view moves after every frame, thus changing the read mouse coordintates and creating
    // wild feedback. root is the mouse position 'snapshot' against which the delta is measured
    getMouseDelta(event, root){
        return {x: event.clientX - root.mouseX, y: event.clientY - root.mouseY};
    }

    //take a snapshot of the mouse position and viewbox size/position
    resetMouseMoveRoot(event){
        let vb = this.svgRoot.viewbox();
        let svgXY = this.svgMouseCoord(event);
        this.mouseMoveRoot = {
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
        this.mouseMoveRootNeedsReset = false;
    }

    mouseScrollHandler(event){
        if(this.mouseMoveRootNeedsReset) this.resetMouseMoveRoot(event);
        if(this.mouseScrollActive){
            let mouseDetla = this.getMouseDelta(event, this.mouseMoveRoot);
            let boundVal = (n, l, h) => Math.min(h, Math.max(l, n));
            
            //inverted scrolling
            let scrollFactor = 1/this.mouseMoveRoot.zoom;
            let newVBPos = {
                x: boundVal(this.mouseMoveRoot.vbX - mouseDetla.x * scrollFactor, 0, this.pianoRollWidth - this.mouseMoveRoot.vbWidth),
                y: boundVal(this.mouseMoveRoot.vbY - mouseDetla.y * scrollFactor, 0, this.pianoRollHeight - this.mouseMoveRoot.vbHeight)
            };
            this.svgRoot.viewbox(newVBPos.x, newVBPos.y, this.mouseMoveRoot.vbWidth, this.mouseMoveRoot.vbHeight);
        }
    }

    mouseZoomHandler(event){
        if(this.mouseMoveRootNeedsReset) this.resetMouseMoveRoot(event);
        if(this.mouseZoomActive){
            let mouseDetla = this.getMouseDelta(event, this.mouseMoveRoot);
            let boundVal = (n, l, h) => Math.min(h, Math.max(l, n));

            let zoomChange = (4**(mouseDetla.y/this.mouseMoveRoot.zoom / this.mouseMoveRoot.vbHeight));
            let zoomFactor = this.mouseMoveRoot.zoom * zoomChange;
            if(zoomFactor < this.maxZoom) return;
            
            let svgMouseVBOffsetX = this.mouseMoveRoot.svgX - this.mouseMoveRoot.vbX;
            let svgMouseVBOffsetY = this.mouseMoveRoot.svgY - this.mouseMoveRoot.vbY;
            let newWidth = this.mouseMoveRoot.vbWidth/zoomChange;
            let newHeight = this.mouseMoveRoot.vbHeight/zoomChange;
            let newVBPos = {
                x: boundVal(this.mouseMoveRoot.svgX - svgMouseVBOffsetX/zoomChange, 0, this.pianoRollWidth - newWidth),
                y: boundVal(this.mouseMoveRoot.svgY - svgMouseVBOffsetY/zoomChange, 0, this.pianoRollHeight - newHeight)
            };

            this.svgRoot.viewbox(newVBPos.x, newVBPos.y, newWidth, newHeight);
        }
    }

    keydownHandler(event){
        if(event.key == 'Shift') this.shiftKeyDown = true; 
        if(event.ctrlKey && !event.altKey){
            this.mouseMoveRootNeedsReset = true;
            this.mouseScrollActive = true;
            this.temporaryMouseMoveHandler = ev => this.mouseScrollHandler(ev);
            this.containerElement.addEventListener('mousemove', this.temporaryMouseMoveHandler);
        }
        if(event.altKey && !event.ctrlKey){
            this.mouseMoveRootNeedsReset = true;
            this.mouseZoomActive = true;
            this.temporaryMouseMoveHandler = ev => this.mouseZoomHandler(ev);
            this.containerElement.addEventListener('mousemove', this.temporaryMouseMoveHandler);
        }
        if(event.key == 'Backspace'){
            this.deleteNotes(this.selectedElements);
        }
        if(event.key === 'z' && event.metaKey){
            if(this.shiftKeyDown) this.executeRedo();
            else this.executeUndo();
        }
        if(event.key === 'c' && event.metaKey){
            if(this.selectedElements.size > 0) this.copyNotes();
        }
        if(event.key === 'v' && event.metaKey){
            if(this.copiedNoteBuffer.length > 0) this.pasteNotes();
        }
        if(event.key === 'ArrowUp'){
            if(this.selectedElements.size > 0) this.shiftNotesPitch(1);
            event.preventDefault();
        }
        if(event.key === 'ArrowDown'){
            if(this.selectedElements.size > 0) this.shiftNotesPitch(-1);
            event.preventDefault();
        }
        if(event.key === 'ArrowLeft'){
            if(this.selectedElements.size > 0) this.shiftNotesTime(-0.25);
            event.preventDefault();
        }
        if(event.key === 'ArrowRight'){
            if(this.selectedElements.size > 0) this.shiftNotesTime(0.25);
            event.preventDefault();
        }
        if(event.key === ' '){
            if(pianoRollIsPlaying) {
                stopPianoRoll(this);
            }
            else {
                playPianoRoll(this);
            }
            event.preventDefault();
        }
        if(['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)){//have 1, 2, 3, 4 be different lengths
            let noteInfo = this.svgXYtoPitchPosQuant(this.mousePosition.x, this.mousePosition.y);
            let keyNum = parseFloat(event.code[5]);
            let dur = 2**(keyNum-1) * (this.shiftKeyDown ? 2 : 1) * 0.25;
            this.addNote(noteInfo.pitch, noteInfo.position, dur);
        }
        if(event.key == 'q'){ 
            this.getNotesAtPosition(this.cursorPosition+0.01).map(n => this.playHandler(n.info.pitch));
        }
        if(event.key == 'w'){
            if(!this.wIsDown){
                this.wIsDown = true;
                this.getNotesAtPosition(this.cursorPosition+0.01).map(n => this.noteOnOffHandler(n.info.pitch, 'on'));
            }
        }
        event.stopPropagation();
    }

    keyupHandler(event){
        if(event.key == 'Shift') this.shiftKeyDown = false; 
        if(!event.ctrlKey && this.mouseScrollActive) {
            this.mouseScrollActive = false;
            this.containerElement.removeEventListener('mousemove', this.temporaryMouseMoveHandler);
            this.temporaryMouseMoveHandler = null;
        }
        if(!event.altKey && this.mouseZoomActive) {
            this.mouseZoomActive = false;
            this.containerElement.removeEventListener('mousemove', this.temporaryMouseMoveHandler);
            this.temporaryMouseMoveHandler = null;
        }
        if(event.key == 'w'){ 
            this.wIsDown = false;
            //replace with generic interactionPlay() handler 
            this.getNotesAtPosition(this.cursorPosition+0.01).map(n => this.noteOnOffHandler(n.info.pitch, 'off'));
        }
    }

    copyNotes(){
        this.selectedNoteIds = Array.from(this.selectedElements).map(elem => elem.noteId);
        let selectedNoteInfos = this.selectedNoteIds.map(id => this.notes[id].info);
        let minNoteStart = Math.min(...selectedNoteInfos.map(info => info.position));
        this.copiedNoteBuffer = selectedNoteInfos.map(info => {
            let newInfo = Object.assign({}, info);
            newInfo.position -= minNoteStart
            return newInfo;
        });
    }

    pasteNotes(){
        this.initializeNoteModificationAction();

        //marking the newly pasted notes as 'selected' eases overlap handling
        this.selectedNoteIds = this.copiedNoteBuffer.map(info => this.addNote(info.pitch, this.cursorPosition+info.position, info.duration, true));
        this.selectedElements = new Set(this.selectedNoteIds.map(id => this.notes[id].elem));
        
        this.executeOverlapVisibleChanges();
        this.updateNoteStateOnModificationCompletion();

        //deselect all notes to clean up 
        Object.keys(this.notes).forEach((id)=>this.deselectNote(this.notes[id].elem));
    }

    shiftNotesPitch(shiftAmount){
        this.initializeNoteModificationAction();
        this.selectedNoteIds.forEach(id => {
            let note = this.notes[id];
            note.info.pitch += shiftAmount;
            this.playHandler(note.info.pitch);
            this.updateNoteElement(note);
        });
        this.executeOverlapVisibleChanges();
        this.updateNoteStateOnModificationCompletion();
        // this.refreshNoteModStartReference(this.selectedNoteIds);
        // this.snapshotNoteState();
    }

    shiftNotesTime(shiftAmount){
        this.initializeNoteModificationAction();
        this.selectedNoteIds.forEach(id => {
            let note = this.notes[id];
            note.info.position += shiftAmount;
            this.updateNoteElement(note);
        });
        this.executeOverlapVisibleChanges();
        this.updateNoteStateOnModificationCompletion();
        // this.refreshNoteModStartReference(this.selectedNoteIds);//
        // this.snapshotNoteState();
    }

    snapshotNoteState(){
        console.log('snapshot', this.historyList.length, this.historyListIndex);
        let noteState = Object.values(this.notes).map(note => Object.assign({}, note.info));
        if(this.historyListIndex == this.historyList.length-1){
            this.historyList.push(noteState);
        } else {
            this.historyList = this.historyList.splice(0, this.historyListIndex+1);
            this.historyList.push(noteState);
        }
        this.historyListIndex++;
    }

    executeUndo() {
        if(this.historyListIndex == 0) return; //always start with an 'no-notes' state
        this.historyListIndex--;
        this.restoreNoteState(this.historyListIndex);
    }

    executeRedo() {
        if(this.historyListIndex == this.historyList.length-1) return;
        this.historyListIndex++;
        this.restoreNoteState(this.historyListIndex);
    }

    restoreNoteState(histIndex){
        Object.values(this.notes).forEach(note => this.deleteElement(note.elem));
        this.notes = {};
        let noteState = this.historyList[histIndex];
        noteState.forEach((noteInfo)=>{
            this.addNote(noteInfo.pitch, noteInfo.position, noteInfo.duration, true);
        });
    }

    midiPitchToPitchString(pitch){ 
        return this.pitchStrings[pitch%12] + (Math.floor(pitch/12)-2)
    }

    svgYToPitchString(yVal){
        let pitch = this.svgYtoPitch(yVal);
        return this.midiPitchToPitchString(pitch);
    }

    //function that snapes note svg elements into place
    snapPositionToGrid(elem, xSize, ySize){
        elem.x(Math.round(elem.x()/xSize) * xSize);
        elem.y(Math.round(elem.y()/ySize) * ySize); //because we're using lines instead of rectangles
        let label = this.notes[elem.noteId].label;
        label.x(Math.round(elem.x()/xSize) * xSize + this.textDev);
        label.y(Math.round(elem.y()/ySize) * ySize); //because we're using lines instead of rectangles
        label.text(this.svgYToPitchString(label.y()));
    }

    // Resets the 'start' positions/sizes of notes for multi-select transformations to current position/sizes
    refreshNoteModStartReference(noteIds){
        this.noteModStartReference = {};
        noteIds.forEach((id)=>{ 
            this.noteModStartReference[id] = {
                x:  this.notes[id].elem.x(), 
                y:  this.notes[id].elem.y(), 
                width: this.notes[id].elem.width(), 
                height: this.notes[id].elem.height()
            };
        });
    }


    getNotesAtPosition(pos){
        let notesAtPos = Object.values(pianoRoll.notes).filter(n => n.info.position <= pos && pos <= n.info.position+n.info.duration);
        return notesAtPos;
    }

    //used to differentiate between 'clicks' and 'drags' from a user perspective
    //to stop miniscule changes from being added to undo history
    checkIfNoteMovedSignificantly(noteElement, thresh){
        return Math.abs(noteElement.x() - this.noteModStartReference[noteElement.noteId].x) > thresh || Math.abs(noteElement.y() - this.noteModStartReference[noteElement.noteId].y) > thresh;
    }

    //used to differentiate between 'clicks' and 'resize' from a user perspective 
    //to stop miniscule changes from being added to undo history
    checkIfNoteResizedSignificantly(noteElement, thresh){
        return Math.abs(noteElement.width() - this.noteModStartReference[noteElement.noteId].width) > thresh;
    }

    initializeNoteModificationAction(element){
        this.selectedNoteIds = Array.from(this.selectedElements).map(elem => elem.noteId);
        this.nonSelectedModifiedNotes.clear();
        if(element && !this.selectedNoteIds.includes(element.noteId)) {
            if(!this.shiftKeyDown) this.clearNoteSelection();
            this.selectNote(element);
            this.selectedNoteIds = [element.noteId];
        }
        this.populateSpatialNoteTracker();
        this.refreshNoteModStartReference(this.selectedNoteIds);
    }


    updateNoteStateOnModificationCompletion(){
        this.refreshNoteModStartReference(this.selectedNoteIds);
        let changedNotes = this.selectedNoteIds.map(id => this.notes[id]).concat(Array.from(this.nonSelectedModifiedNotes).map(id => this.notes[id]));
        this.updateNoteInfoMultiple(changedNotes);
    }


    endSelect(){
        this.selectRect.draw('stop', event);
        this.selectRect.remove();
        this.svgRoot.off('mousemove');
        this.selectRect = null;
    }

    endDrag(){
        this.draggingActive = false;
        this.quantDragActivated = false;

        this.svgRoot.off('mousemove');

        //used to prevent click events from triggering after drag
        this.dragTarget.motionOnDrag = this.checkIfNoteMovedSignificantly(this.dragTarget, 3);
        if(!this.dragTarget.motionOnDrag) return;

        //refresh the startReference so the next multi-select-transform works right
        this.updateNoteStateOnModificationCompletion();
        this.dragTarget = null;
    }

    endResize(){
        this.resizingActive= false;
        this.quantResizingActivated = false;

        this.svgRoot.off('mousemove');

        if(!this.checkIfNoteResizedSignificantly(this.resizeTarget, 3)) return;
        console.log('resize done');

        this.resizeTarget.resize();

        this.updateNoteStateOnModificationCompletion();
        this.resizeTarget = null;
    }

    startDragSelection(){
        //clear previous mouse multi-select gesture state
        this.clearNoteSelection();

        //restart new mouse multi-select gesture
        this.selectRect = this.svgRoot.rect().fill('#008').attr('opacity', 0.25);
        this.selectRect.draw(event);
        this.svgRoot.on('mousemove', (event)=>{
            
            //select this.notes which intersect with the selectRect (mouse selection area)
            Object.keys(this.notes).forEach((noteId)=>{
                let noteElem = this.notes[noteId].elem;
                
                let intersecting = this.selectRectIntersection(noteElem);
                if(intersecting) {
                    this.selectNote(noteElem);                        
                } else {
                    this.deselectNote(noteElem)
                }
            });
        });
    }

    // attaches the appropriate handlers to the mouse event allowing to to 
    // start a multi-select gesture (and later draw mode)
    attachHandlersOnBackground(backgroundElements_, svgParentObj){ 
        // need to listen on window so select gesture ends even if released outside the 
        // bounds of the root svg element or browser
        window.addEventListener('mouseup', (event)=>{
            //end a multi-select drag gesture
            if(this.selectRect) {
                this.endSelect();
            }
            if(this.draggingActive){
                this.endDrag();
            } 
            if(this.resizingActive){
                this.endResize();
            }
        });

        backgroundElements_.forEach((elem)=>{
            elem.on('mousedown', (event)=>{
                let quantRound = (val, qVal) => Math.round(val/qVal) * qVal;
                let mouseXY = this.svgMouseCoord(event);
                let posSVG = quantRound(mouseXY.x, this.quarterNoteWidth/4);
                this.cursorElement.x(posSVG-this.cursorWidth/2);
                this.cursorPosition = posSVG/this.quarterNoteWidth;
                // console.log('mousedown background', posSym, posSVG, event);
                this.startDragSelection();
            });

            elem.on('dblclick', (event)=>{
                let svgXY = this.svgMouseCoord(event);
                let pitchPos = this.svgXYtoPitchPosQuant(svgXY.x, svgXY.y);
                this.addNote(pitchPos.pitch, pitchPos.position, 4/this.noteSubDivision, false);
            }); 
        });
    }



    populateSpatialNoteTracker(){
        this.spatialNoteTracker = {};
        Object.values(this.notes).forEach((note)=>{
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
        let currentlyModifiedNotes = new Set();
        let notesToRestore = new Set();
        this.selectedElements.forEach((selectedElem)=>{
            let selectedNote = this.notes[selectedElem.noteId];
            let samePitch = this.spatialNoteTracker[selectedNote.info.pitch];
            if(samePitch) {
                samePitch.forEach((note)=>{
                    if(selectedElem.noteId != note.elem.noteId) {
                        if(this.selectedElements.has(note.elem)){
                            let earlierElem = note.elem.x() < selectedNote.elem.x() ? note : selectedNote;
                            let laterElem = note.elem.x() > selectedNote.elem.x() ? note : selectedNote; 
                            //todo - handle case when two selected notes are the same pitch and you do a group resize and one overlaps another


                        } else {

                            //truncating the end of the non-selected note
                            if(note.info.position < selectedNote.info.position && selectedNote.info.position < note.info.position+note.info.duration) {
                                if(this.count++ < 10) console.log(this.nonSelectedModifiedNotes, currentlyModifiedNotes, notesToRestore);
                                currentlyModifiedNotes.add(note.elem.noteId);
                                note.elem.show();
                                note.label.show();
                                note.elem.width((selectedNote.info.position - note.info.position)*this.quarterNoteWidth);
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
        notesToRestore = this.setDifference(this.nonSelectedModifiedNotes, currentlyModifiedNotes);
        notesToRestore.forEach(id => this.updateNoteElement(this.notes[id]));
        this.nonSelectedModifiedNotes = currentlyModifiedNotes;
    }

    setDifference(setA, setB){
        var difference = new Set(setA);
        for (var elem of setB) {
            difference.delete(elem);
        }
        return difference;
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

        noteElement.on('point', (event)=>{ console.log('select', event)});

        noteElement.on('mousedown', (event)=>{
            if(!this.mouseScrollActive && !this.mouseZoomActive) {
                this.resetMouseMoveRoot(event);
                this.dragTarget = this.rawSVGElementToWrapper[event.target.id];
                this.initializeNoteModificationAction(this.dragTarget);
                this.draggingActive = true;
                svgParentObj.on('mousemove', (event)=>{
                    let svgXY = this.svgMouseCoord(event);
                    let xMove;
                    let xDevRaw = svgXY.x - this.mouseMoveRoot.svgX;
                    let quantWidth = this.quarterNoteWidth * (4/this.noteSubDivision);
                    let quant = (val, qVal) => Math.floor(val/qVal) * qVal;
                    let quantRound = (val, qVal) => Math.round(val/qVal) * qVal;
                    
                    if(Math.abs(svgXY.x - this.mouseMoveRoot.svgX) < quantWidth * 0.9 && !this.quantDragActivated) { 
                        xMove = xDevRaw;
                    } else {
                        xMove = quantRound(xDevRaw, quantWidth);
                        this.quantDragActivated = true;
                    }
                    let yMove = quant(svgXY.y, this.noteHeight) - quant(this.mouseMoveRoot.svgY, this.noteHeight);
                    this.selectedNoteIds.forEach((id)=>{
                        let noteModStart = this.noteModStartReference[id];
                        //Todo - make note quantization more like ableton's on drag
                        this.notes[id].elem.x(noteModStart.x + xMove);
                        this.notes[id].elem.y(noteModStart.y + yMove);
                        this.notes[id].label.x(noteModStart.x + xMove + this.textDev);
                        this.notes[id].label.y(noteModStart.y + yMove);
                        this.notes[id].label.text(this.svgYToPitchString(this.notes[id].label.y()));
                        this.updateNoteInfo(this.notes[id], true);
                    });
                    this.executeOverlapVisibleChanges();
                });
            }
        });

        noteElement.on('resizestart', (event)=>{
            this.resizeTarget = this.rawSVGElementToWrapper[event.target.id];
            this.initializeNoteModificationAction(this.resizeTarget);

            //extracting the base dom-event from the SVG.js event so we can snapshot the current mouse coordinates
            this.resetMouseMoveRoot(event.detail.event.detail.event);

            //inProgress - to get reizing to work with inter-select overlap and to stop resizing of 
            //clicked element at the start of another selected element, might need to remove the resize
            //handlers of all of the selected elements here, calculate the resize using 'mousemove' info 
            //by moving 'resizing' handler logic to 'mousemove', and then on 'mouseup' reattaching 'resize'
            //handler (at least, for 'resizestart' to piggyback on the gesture detection).
            
            this.resizeTarget.resize('stop');
            this.resizingActive = true;
            svgParentObj.on('mousemove', (event)=>{
                let svgXY = this.svgMouseCoord(event);
                let xMove;
                let xDevRaw = svgXY.x - this.mouseMoveRoot.svgX;
                let oldX = this.noteModStartReference[this.resizeTarget.noteId].x;
                let isEndChange = this.resizeTarget.x() === oldX; //i.e, whehter you're moving the 'start' or 'end' of the note
                this.selectedNoteIds.forEach((id)=>{
                    let oldNoteVals = this.noteModStartReference[id];
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
                    this.updateNoteInfo(this.notes[id], true);
                });
                this.executeOverlapVisibleChanges();
            })
        });

        // noteElement.on('click', function(event){
        //     if(!this.motionOnDrag) {
        //         if(!this.shiftKeyDown) clearNoteSelection();
        //         console.log('this.shiftKeyDown on click', this.shiftKeyDown);
        //         selectNote(this);
        //     }
        // });

        noteElement.on('dblclick', (event)=>{
            this.deleteNotes([this.rawSVGElementToWrapper[event.target.id]]);
        })
    }


    selectNote(noteElem){
        if(!this.selectedElements.has(noteElem)) {
            this.selectedElements.add(noteElem);
            noteElem.fill(this.selectedNoteColor);
            this.playHandler(this.notes[noteElem.noteId].info.pitch)
        }
    }

    deselectNote(noteElem){
        if(this.selectedElements.has(noteElem)) {
            this.selectedElements.delete(noteElem);
            noteElem.fill(this.noteColor);
        }
    }

    // calculates if a note intersects with the mouse-multiselect rectangle
    selectRectIntersection(noteElem){
        //top-left and bottom right of bounding rect. done this way b/c getBBox doesnt account for line thickness
        let noteBox = {
            tl: {x: noteElem.x(), y: noteElem.y() - this.noteHeight/2},  
            br: {x: noteElem.x() + noteElem.width(), y: noteElem.y() + this.noteHeight/2},
        };
        let selectRectBox = this.selectRect.node.getBBox();
        let selectBox = {
            tl: {x: selectRectBox.x, y: selectRectBox.y},
            br: {x: selectRectBox.x + selectRectBox.width , y: selectRectBox.y + selectRectBox.height}
        };
        return this.boxIntersect(noteBox, selectBox);
    }

    //the actual rectangle intersection calculation, separated out for debugging ease
    boxIntersect(noteBox, selectBox){
        let returnVal = true;
        //if noteBox is full to the left or right of select box
        if(noteBox.br.x < selectBox.tl.x || noteBox.tl.x > selectBox.br.x) returnVal = false;

        //if noteBox is fully below or above rect box
        //comparison operators are wierd because image coordinates used e.g (0,0) at 'upper left' of positive quadrant
        if(noteBox.tl.y > selectBox.br.y || noteBox.br.y < selectBox.tl.y) returnVal = false;
        return returnVal;
    }

    clearNoteSelection(){
        this.selectedElements.forEach(noteElem => this.deselectNote(noteElem));
    }
}
