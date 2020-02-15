import { BehaviorSubject, Subscription, Observable, interval } from "rxjs";
import { take, map, scan, concatMap } from "rxjs/operators";

/*-----------------------------
TODO: 
・シーンの一時停止とレジューム
・バックログ　
------------------------------*/

const defaultCharacterDelay = 100;
const defaultWordDelay = 1500;

interface SceneCommand {
  command: string;
  cuts?: Array<Array<string | number>>;
}

interface SceneStatus {
   status: string;
   previous_command: string;
   cuts: Array<Array<string | number>>;
   subscription: Subscription
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
const sceneSubj = new BehaviorSubject({ command: SCENE_COMMAND_PLAY, cuts: loadNextCut()} as SceneCommand);

sceneSubj.pipe(
  scan((scene: SceneStatus, newcommand: SceneCommand) => {


    // PLAY
    if(newcommand.command == SCENE_COMMAND_PLAY
               && scene.status != SCENE_STATUS_PLAYING ){

      if(newcommand.cuts === undefined){
        console.log('Error: scene is undefined. ');
        return scene;
      }
      else if(newcommand.cuts.length == 0){
        console.log('All cuts have been played. ');

        // Stop to subscribe chatterObs
        scene.subscription.unsubscribe();  

        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:',scene.status,'=>',newstatus);

        return {
          status: newstatus,
          previous_command: newcommand.command,
          cuts: [],
          subscription: null
        }
      }
      else{
        const newstatus = SCENE_STATUS_PLAYING;
        console.log('status:',scene.status,'=>',newstatus);
        return {
          status: newstatus,
          previous_command: newcommand.command,
          cuts: newcommand.cuts,
          subscription: playActions()
        };
      }
    }


    // PUSH CUT
    if(newcommand.command == SCENE_COMMAND_PUSH_CUT
       && ( scene.status == SCENE_STATUS_PLAYING || scene.status == SCENE_STATUS_PAUSED )){

      if(newcommand.cuts === undefined){
        console.log('Error: scene is undefined. ');
        return scene;
      }
      else if(newcommand.cuts.length == 0){
        console.log('All cuts have been played. ');

        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:',scene.status,'=>',newstatus);

        return {
          status: newstatus,
          previous_command: newcommand.command,
          cuts: [],
          subscription: null
        }
      }
      else{
        return {
          status: scene.status,
          previous_command: newcommand.command,
          cuts: newcommand.cuts,
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
        cuts: [],
        subscription: null
      }
    }


    else{
      console.log('invalid command:',newcommand.command,',current status:',scene.status);
        return scene;
    }
  },
  { 
    cuts: [],
    previous_command: SCENE_COMMAND_NONE,
    status: SCENE_STATUS_INITIAL,
    subscription: null
  })
).subscribe();




/*------------------------------------
/ Play Actions
/------------------------------------ */
function playActions(){

  // Playing Actions in a Cut
  // inserting N ms dekay after each action. 
  const actionsSubj = new Observable(subscriber => {

    // Promise that outputs an Action, then waits waitMSec
    const nextword = (waitMSec, action) => {
      return new Promise(resolve => {
        // output an action
        subscriber.next(action);
        setTimeout(() => {
          resolve();
        }, waitMSec);
      }); 
    };

    let isPlaying = true;
    // Sequential execution of nextword Promises
    const sequential = function(array) {
      array.reduce((promise, val) => {
        return promise.then(() => {
            if(!isPlaying){
              throw new Error();
            }
            return nextword(
              val.length > 1 ? val[1] : defaultWordDelay, 
              {
                str: val.length > 0 ? val[0] : "",
                interval: val.length > 2 ? val[2] : defaultCharacterDelay
              })
          } 
        )
      }, Promise.resolve())
      .then(() => {
        // A Cut has been completed 
        if(isPlaying){
          sceneSubj.next(
            {
              command: SCENE_COMMAND_PUSH_CUT, 
              cuts: loadNextCut(), 
            } as SceneCommand);
        }
      });
    };
    sequential(sceneSubj.getValue().cuts);
    
    // Provide a way of canceling and disposing the interval resource
    return function unsubscribe() {
      isPlaying = false;
    };
  });
 

  // 入力されたセリフについて
  // 文字間に指定秒のディレイを入れつつ一文字ずつ表示
  const chatterObs = actionsSubj.pipe(
    concatMap(input =>
      interval(input.interval).pipe(
        // 入力文字列を input.interval 間隔で一文字ずつ表示する
        scan(
          (state, count) => ({
            arr: state.arr,
            i: count % input.str.length
          }),
          {
            arr: input.str.split(""),
            i: 0
          }
        ),
        map(state => state.arr[state.i]),
        take(input.str.length)
      )
    )
  ).subscribe(
    out => (document.body.innerHTML += out)
  );
  return chatterObs;

};




// Test for cancel command

setTimeout(()=> sceneSubj.next(
    {
      command: SCENE_COMMAND_STOP,
    }), 4000);
