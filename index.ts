
import { BehaviorSubject, Subscription, Observable, interval } from "rxjs";
import { take, map, scan, concatMap } from "rxjs/operators";

console.clear();

/*-----------------------------
TODO: 
・PushableObservableWrapper の setIntervalで処理している箇所について
　queueが空なら一時停止する
　並行処理
　アクションの開始時刻のオフセット
・シーンの一時停止とレジューム
------------------------------*/

const defaultCharacterDelay = 100;
const defaultWordDelay = 1500;

interface SceneCommand {
  command: string;
  cut?: Array<Object>;
}

interface SceneStatus {
  status: string;
  previous_command: string;
  cut: Array<Object>;
  subscription: Subscription;
}

interface TextAction {
  str: string;
  interval: number;
  afterWait: number;
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
 
  {
    // Parallel actions
    1: { agent: { name: 'Japanese',
        text: [{ str: 'それは、', interval: 100, afterWait: 1000},
        { str: 'まるで', interval: 100, afterWait: 1000},
        { str: '夢のようで、', interval: 100, afterWait: 1000},
        { str: 'あれ、覚めない、覚めないぞ、', interval: 100, afterWait: 3000},
        { str: 'って思っていて、', interval: 100, afterWait: 1000}]
      }
    },
    2: { agent: { name: 'English',  
        text: [{ str: 'soreha, ', interval: 100, afterWait: 1000},
        { str: 'marude', interval: 100, afterWait: 1000},
        { str: 'yumenoyoude', interval: 100, afterWait: 1000},
        { str: 'are, samenai, samenaizo', interval: 100, afterWait: 3000},
        { str: 'tte omotteite,', interval: 100, afterWait: 1000}]
      }
    },
  },
  // Global command
  { command: { wait: 1000 }},
  // Single action
  { agent: { name: 'Japanese', 
      text: [{ str: 'それがいつまでも続いて。', interval: 100, afterWait: 1000},
      { str: '・・', interval: 500, afterWait: 2000},
      { str: 'まだ続いている', interval: 100, afterWait: 1000}]
    }
  }
]

const CUT02 = [
//  ["それがいつまでも続いて。"],
//  ["・・", 2000, 500],
//  ["まだ続いている。"]
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
          subscription: playActions(newcommand.cut)
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
          subscription: playActions(newcommand.cut)
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



function playActions(cut: Array<Object>){
  const obs = new Observable(subscriber => {
    const agentAction = async (agent) => {
      playWords(agent.text);
    };
    const command = async (command) => {
    
    };
    const playOneAction = async (action) => {
                  console.log(action)

      if(action.hasOwnProperty('agent')){
        // Single action
        await agentAction(action.agent);
      }
      else if(action.hasOwnProperty('command')){
        // Command
        await command(action.command);
      }
      else{
        for(const property in action){
          // Parallel actions
          if(action[property].hasOwnProperty('agent')){
            await agentAction(action[property].agent);
          }
          else if(action.hasOwnProperty('command')){
            // Command
            await command(action[property].command);
          }
        }
      }
    };
    (async () => {
      for(let i=0; i<cut.length; i++){
       await playOneAction(cut[i]);
     }
    })();
  });
  obs.subscribe();
};


async function playWords(input: TextAction){
  // Play words in a cut
  // inserting delay after each character
  const timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms))
  };
  
  const obs = new Observable(subscriber => {
            console.log(input.str)
    const printOneChar = async (char, afterWaitMs) => {
      subscriber.next(char);
      await timeout(afterWaitMs);
    };
    (async () => {
      const array = input.str.split('');
      for(let i=0; i<array.length; i++){

        await printOneChar(array[i],input.interval);
      }
    })();
  });
  obs.subscribe({
    next: out => (document.body.innerHTML += out)
  });
};
