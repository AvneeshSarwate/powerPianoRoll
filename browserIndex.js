
"use strict";

function pianoRollToToneEvents(pianoRoll){
    let notes = pianoRoll.notes;
    let bpm = Tone.Transport.bpm.value;
    let toneEvents = Object.values(notes).map(noteInfo => {
        let note = noteInfo.info;
        return {
            time: note.position,
            pitch: noteInfo.label.text(), 
            dur: note.duration,
        }
    });
    toneEvents.sort((a, b) => a.time-b.time);
    toneEvents = toneEvents.filter(e => e.time+e.dur > pianoRoll.cursorPosition);
    toneEvents.forEach(e => {
        if(e.time < pianoRoll.cursorPosition) {
            e.dur = e.dur - (pianoRoll.cursorPosition-e.time);
            e.time = 0;
        } else {
            e.time -= pianoRoll.cursorPosition;
        }
    });
    toneEvents = toneEvents.map((note, i) => {
        return {
            time: note.time * 60 / bpm,
            pitch: note.pitch, 
            dur: note.dur  * 60 / bpm,
            info: {
                numNotes: toneEvents.length,
                ind: i
            }
        }
    });
    return toneEvents;
}

//TODO: maybe move part and playing-flag variables to inside toneclass?
let pianoRollIsPlaying = false;
function playPianoRoll(pianoRoll){
    let toneEvents = pianoRollToToneEvents(pianoRoll);

    playingPart = new Tone.Part((time, value) => {
        console.log('part note', time, value);
        pianoRoll.playHandler(value.pitch, value.dur) //and velocity once that's in the piano roll
        if(value.info.numNotes == value.info.ind+1) pianoRollIsPlaying = false;
    }, toneEvents).start();
    pianoRollIsPlaying = true;
}

function stopPianoRoll(){
    if(playingPart){
        pianoRollIsPlaying = false;
        playingPart.stop();
        playingPart.dispose();
    }
}

let pianoRoll;
let synth = new Tone.PolySynth(8).toMaster();
let playingPart;
StartAudioContext(Tone.context, 'body', () => {
    Tone.Transport.start();
});
SVG.on(document, 'DOMContentLoaded', function() {
    let playHandler = function(pitch, duration='16n'){
        //if duration is "on" then just do noteOn, if its "off" just do note off
        let pitchString = typeof pitch === 'string' ? pitch : this.midiPitchToPitchString(pitch);
        synth.triggerAttackRelease(pitchString, duration);
    }
    pianoRoll = new PianoRoll("drawing", playHandler);
});
/*
WORKING BUG LOG 
- X prefix means good workaround found, but the "common sense" approach still fails and idk why



*/


