import { BehaviorSubject, Subscription, Observable, interval } from "rxjs";
import { take, map, scan, concatMap } from "rxjs/operators";

/*-----------------------------
TODO: 
・シーンの一時停止とレジューム
------------------------------*/

const defaultCharacterDelay = 100;
const defaultWordDelay = 1500;

interface SceneCommand {
  command: string;
  cut?: Array<Array<string | number>>;
}

interface SceneStatus {
  status: string;
  previous_command: string;
  cut: Array<Array<string | number>>;
  subscription: Subscription
}

interface SpeechAction {
  str: string;
  interval: number;
}

const SCENE_STATUS_INITIAL = 'initial';
const SCENE_STATUS_PLAYING = 'playing';
const SCENE_STATUS_PAUSED = 'paused';
const SCENE_STATUS_COMPLETED = 'completed';

const SCENE_COMMAND_NONE = 'none';
const SCENE_COMMAND_PLAY = 'play';
const SCENE_COMMAND_PUSH_CUT = 'push_cut'; // Add new cut after the last cut
const SCENE_COMMAND_PAUSE = 'pause';
const SCENE_COMMAND_STOP = 'stop';

// CUT: sequence of ACTIONS
const CUT01 = [
  // ACTION
  // ['word', delayAfterWord, delayAfterCharacter]
  ["それは、", 0, 100],
  ["まるで"],
  ["夢のようで、"],
  ["あれ、覚めない、覚めないぞ、", 3000],
  ["って思っていて、"]
];

const CUT02 = [
  ["それがいつまでも続いて。"],
  ["・・", 2000, 500],
  ["まだ続いている。"]
];

// SCENE: sequence of CUTS
const SCENE01 =  [
  CUT01,
  CUT02,
  []
];

// SEQUENCE: sequence of SCENES
const SEQUENCE = [
  SCENE01
]





const loadNextCut = () => {
  return SCENE01.shift();
};

 
/*------------------------------------
/ Manage Scene Status
/------------------------------------ */
const sceneSubj = new BehaviorSubject({
   command: SCENE_COMMAND_PLAY,
   cut: loadNextCut()
  } as SceneCommand);

sceneSubj.pipe(
  scan((scene: SceneStatus, newcommand: SceneCommand) => {


    // PLAY
    if(newcommand.command == SCENE_COMMAND_PLAY
               && scene.status != SCENE_STATUS_PLAYING ){

      if(newcommand.cut === undefined){
        console.log('Error: scene is undefined. ');
        return scene;
      }
      else if(newcommand.cut.length == 0){
        console.log('All cuts have been played. ');

        // Stop to subscribe chatterObs
        scene.subscription.unsubscribe();  

        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:',scene.status,'=>',newstatus);

        return {
          status: newstatus,
          previous_command: newcommand.command,
          cut: [],
          subscription: null
        }
      }
      else{
        const newstatus = SCENE_STATUS_PLAYING;
        console.log('status:',scene.status,'=>',newstatus);
        return {
          status: newstatus,
          previous_command: newcommand.command,
          cut: newcommand.cut,
          subscription: playActions()
        };
      }
    }


    // PUSH CUT
    if(newcommand.command == SCENE_COMMAND_PUSH_CUT
       && ( scene.status == SCENE_STATUS_PLAYING || scene.status == SCENE_STATUS_PAUSED )){

      if(newcommand.cut === undefined){
        console.log('Error: scene is undefined. ');
        return scene;
      }
      else if(newcommand.cut.length == 0){
        console.log('All cuts have been played. ');

        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:',scene.status,'=>',newstatus);

        return {
          status: newstatus,
          previous_command: newcommand.command,
          cut: [],
          subscription: null
        }
      }
      else{
        return {
          status: scene.status,
          previous_command: newcommand.command,
          cut: newcommand.cut,
          subscription: playActions()
        };
      }
    }
 

    // CANCEL
    else if(newcommand.command == SCENE_COMMAND_STOP
              && (scene.status == SCENE_STATUS_PLAYING
                  || scene.status == SCENE_STATUS_PAUSED )){

      console.log('Scene has been canceled');
      
      const newstatus = SCENE_STATUS_COMPLETED;
      console.log('status:',scene.status,'=>',newstatus);

      // Stop to subscribe chatterObs
      scene.subscription.unsubscribe();      
      
      return {
        status: newstatus,
        previous_command: newcommand.command,
        cut: [],
        subscription: null
      }
    }


    else{
      console.log('invalid command:',newcommand.command,',current status:',scene.status);
        return scene;
    }
  },
  { 
    status: SCENE_STATUS_INITIAL,
    previous_command: SCENE_COMMAND_NONE,
    cut: [],
    subscription: null
  })
).subscribe();




/*------------------------------------
/ Play Actions
/------------------------------------ */
function playActions(){

  // Play ations in a Cut
  // inserting N ms dekay after each action. 
  const actionsSubj = new Observable(subscriber => {
        let isPlaying = true;


    const actionStream = sceneSubj.getValue().cut;
    
    const sleep = msec => new Promise(resolve => setTimeout(resolve, msec));

    // Outputs an Action, then waits waitMSec
    const nextword = async () => {
      const val = actionStream.shift;
      if(val){
        const waitMSec = val.length > 1 ? val[1] : defaultWordDelay;
        const action = {
                        str: val.length > 0 ? val[0] : "",
                        interval: val.length > 2 ? val[2] : defaultCharacterDelay
                    } as SpeechAction;
        await subscriber.next(action);
        await sleep(waitMSec);
      }
      else {
        // A Cut has been completed 
        if(isPlaying){
          sceneSubj.next(
            {
              command: SCENE_COMMAND_PUSH_CUT, 
              cut: loadNextCut(), 
            } as SceneCommand);
        }
      }
    };
    
    for(i=0;i<3;i++){
      console.log('hello');
      nextword();
    }
    // Provide a way of canceling and disposing the interval resource
    return function unsubscribe() {
      isPlaying = false;
    };
  });
 

  // Play words in a cut
  // inserting delay after each character
  const chatterObs = actionsSubj.pipe(
    concatMap(input =>
      interval((input as SpeechAction).interval).pipe(
        // output characters at input.interval
        scan(
          (state, count) => ({
            arr: state.arr,
            i: count % (input as SpeechAction).str.length
          }),
          {
            arr: (input as SpeechAction).str.split(""),
            i: 0
          }
        ),
        map(state => state.arr[state.i]),
        take((input as SpeechAction).str.length)
      )
    )
  ).subscribe(
    out => (document.body.innerHTML += out)
  );
  return chatterObs;

};




// Test for cancel command
/*
setTimeout(()=> sceneSubj.next(
    {
      command: SCENE_COMMAND_STOP,
    }), 4000);
*/