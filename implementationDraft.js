

class PianoRoll {
    constructor(canvas){
        this.canvas = canvas;
        this.canvasHeight = canvas.height;
        this.canvasWidth = canvas.width;
        this.numNotesShown = 20; //always an integer
        this.numMeasuresHown = 4; //always a multiple of 1/16

        /* This means bottom of the 60-block is aligned with the center.
         * 60.5 would mean the center is aligned with halfway through the 60-block */ 
        this.centerNote = 60; //notes are 0-indexed

        /* This means left-end of the 2-block is aligned with the center.
         * 2.5 would mean the center is aligned with halfway through the 2-block */
        this.centerMeasure = 2; //measures are 0-indexed

        this.notes = [];
    }



    drawBackground(){
        //draw the "white key" color background


        //calculate where horizontal block divisions are
        //draw the "black key" horizontal blocks
        //draw the horizontal lines

        //calculate where vertical lines are
    }

    drawNotes(){

    }
}

/*
basic strategy for using SVG:
In SVG you can draw on an arbitrarily large plane and have a "viewbox" that shows a sub-area of that.
Because of this, for a piano roll, you can "draw" a piano-roll at an arbitrary size and move around
the viewbox rather than "redrawing" the piano roll when you want to zoom/move. What's TBD is to see
how annoying it might be to program selecting/dragging/highlighting/resizing with this approach. 
In general, aiming for Ableton piano-roll feature parity wrt mouse interaction (assuming keyboard shortcut
is trivial to implement if you can get the mouse stuff right)

order of library features to test (for each, make sure they're sensible under viewbox zoom too):
- X - dragging behavior 
- X - dragging and snap to grid
    - NOTE - clicking on a note is interpeted as a "drag" and will automatically quantize it
- multiselection + dragging via mouse
    - see what visualization of selections looks like and tweak it
    - TODO - figure out a visual higlight/selection mechanism - 
      the selection plugin doesn't do that on its own
- X - multiselection + dragging + snap to grid
- multiselection and ableton style resizing
- multiselected resizing + snap to grid
- figure out good UI for viewbox resizing/position control (panzoom plugin if necessary?)
    - figure out how to map mouse coordinates to SVG coordinates

Except for zoom events, which will likely be attatched to the root SVG element, events/plugins will
only be added to the "note" svg elements

*/

//testing SVG library api
var draw;
var l1, l2;
/* a dictionary that, upon the start of a group drag/resize event, stores the 
 * initial positions and lengths of all notes so that the mouse modifications to
 * one note can be bounced to the rest of the selected notes*/
var noteModStartReference;
var notes = {};

var xSnap = 200;
var ySnap = 50;
function snapPositionToGrid(elem, xSize, ySize){
    elem.x(Math.round(elem.x()/xSize) * xSize);
    elem.y(Math.round(elem.y()/ySize) * ySize);
}
var selectedElements;


function refreshNoteModStartReference(noteIds){
    noteModStartReference = {};
    noteIds.forEach(function(id){ 
        noteModStartReference[id] = {
            x:  notes[id].x(), 
            y:  notes[id].y(), 
            //x1 is the same as x() when using a line, but keeps 
            //properties for drag/resize separate and more readable for now
            x1: notes[id].attr('x1'), 
            x2: notes[id].attr('x2')
        };
    });
}

function setMultiSelectHandlers(noteElement){
    var noteIds = selectedElements.map(elem => elem.noteId);

    /* sets the initial position of all the selected elements so you can
     * calculate the movement of the "other" selected elements when you are
     * dragging a particular element with your mouse 
     */ 
     refreshNoteModStartReference(noteIds);

    /* Performs the same drag deviation done on the clicked element to 
     * the other selected elements
     */
    noteElement.draggable().on('dragmove', function(event){
        console.log("dragmove")
        var xMove = this.x() - noteModStartReference[this.noteId].x;
        var yMove = this.y() - noteModStartReference[this.noteId].y;
        var thisId = this.noteId;
        noteIds.forEach(function(id){
            if(id != thisId) {
                notes[id].x(noteModStartReference[id].x + xMove);
                notes[id].y(noteModStartReference[id].y + yMove);
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
            snapPositionToGrid(elem, xSnap, ySnap); //TODO - x-variable will change depending on user quantization choice
            refreshNoteModStartReference(noteIds);
        });
    });

    noteElement.on('resizing', function(event){
        var oldX1 = noteModStartReference[this.noteId].x1;
        var isEndChange = this.attr('x1') === oldX1;
        var thisId = this.noteId;
        noteIds.forEach(function(id){
            if(id != thisId){
                var oldNoteVals = noteModStartReference[id];
                if(isEndChange) notes[id].attr('x2', oldNoteVals.x2 + event.detail.dx);
                else notes[id].attr('x1', oldNoteVals.x1 + event.detail.dx);
            }
        });
    });

    noteElement.on('resizedone', function(event){
        refreshNoteModStartReference(noteIds);
    })
}

SVG.on(document, 'DOMContentLoaded', function() {

    //set up a background that you can see elements against, which will 
    //later be the piano roll backdrop
    var boxSize = 200;
    draw = SVG('drawing').size(300, 300);
    var rect = draw.rect(boxSize, boxSize).attr({ fill: '#f06' });
    var rect2 = draw.rect(boxSize, boxSize).attr({ fill: '#0f6' }).move(boxSize, 0);
    var rect3 = draw.rect(boxSize, boxSize).attr({ fill: '#60f' }).move(0, boxSize);
    var rect4 = draw.rect(boxSize, boxSize).attr({ fill: '#f60' }).move(boxSize, boxSize);

    //set up the manipulatable elements (which will later be the notes)
    l1 = draw.line(0, 300, 200, 300).stroke({width: 10});
    l2 = draw.line(0, 100, 200, 100).stroke({width: 10});

    //every new note created will have a newly generated noteId. this
    //is a quick setup to show what the note management will look like
    notes = {0: l1, 1: l2};
    l1.noteId = 0;
    l2.noteId = 1;
    Object.keys(notes).forEach(function(key){ //adding snap-to-grid
        note = notes[key];
        note.draggable().on('dragend', function(event){ snapPositionToGrid(this, xSnap, ySnap)});
        note.selectize().resize().on('resizing', function(event){console.log(event)});
    });



    
    /* this will be the end-state of a select mouse gesture that ranges
     * over some set of note elements. Again, just a quick hack setup to
     * test the interaction 
     */
    selectedElements = [l1, l2];
    initMultiNoteMod(selectedElements, setMultiSelectHandlers);

    /* after you click to the background to "unselect" the selected notes,
     * release all the drag event handlers
     */
    // selectedElements.forEach(function(elem){
    //     elem.off('beforedrag');
    //     elem.off('dragmove');
    //     elem.off('dragend');
    //     elem.on('dragend', function(event){snapPositionToGrid(this, 50, 200)})
    // });
    // selectedElements = []
        
    draw.viewbox(0, 0, 400, 400);
});

function initMultiNoteMod(selectedElements_, modHandlers){
    selectedElements_.forEach(modHandlers);   
}

function removeMultiSelectHandlers(selectedElements_){
    selectedElements.forEach(function(elem){
        elem.off('beforedrag');
        elem.off('dragmove');
        elem.off('dragend');
        elem.on('dragend', function(event){snapPositionToGrid(this, xSnap, ySnap)})
    });
}

/*
WORKING BUG LOG
- Clicking on notes snaps them all to grid - not necessarily technically a had fix but need to 
  decide how auto-snapping will work, and need to make it work with resizing (snap start position
  on resize, but using a new function that doesn't "move" the whole note, just the start position?)


*/




/* scratch code for live-coding development/testing
l1.draggable().on('dragend', function(event){snapPositionToGrid(this, 50, 200)})

*/