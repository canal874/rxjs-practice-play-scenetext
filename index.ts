import { BehaviorSubject, Observable, interval } from "rxjs";
import { take, map, scan, concatMap } from "rxjs/operators";

const defaultCharacterDelay = 100;
const defaultWordDelay = 1500;

const loadScene = () => {
  // ['word', delayAfterWord, delayAfterCharacter]
  return [
    ["それは、", 0, 100],
    ["まるで"],
    ["夢のようで、"],
    ["あれ、覚めない、覚めないぞ、", 3000],
    ["って思っていて、"],
    ["それがいつまでも続いて。"],
    ["・・", 2000, 500],
    ["まだ続いている。"]
  ];
};


 
/*------------------------------------
/ シーンの状態管理
/------------------------------------ */
const sceneSubj = new BehaviorSubject({ scene: loadScene(), status: 'start', subscription: null});

sceneSubj.pipe(
  scan((current, newscene) => {
    if(current.status != newscene.status){
      if(newscene.status == 'start'){
        console.log('status:',current.status,'=>',newscene.status);
        current.status = 'start';
        newscene.status = 'playing';

        console.log('status:',current.status,'=>',newscene.status);
        current.scene = newscene.scene;
        current.status = newscene.status;
        current.subscription = playScene();
      }
      else if(newscene.status == 'cancel'){
        console.log('status:',current.status,'=>',newscene.status);
        current.scene = newscene.scene;
        current.status = newscene.status;
        current.subscription.unsubscribe();
        current.subscription = null;
      }
      else{
        console.log('status:',current.status,'=>',newscene.status);
        current = newscene;
      }
    }     
    return current
  },
  {
    scene: [],
    status: 'stop',
    subscription: null
  })
).subscribe();

// シーン再生の中断テスト
setTimeout(()=> sceneSubj.next(
    {
      scene: [],
      status: 'cenceled',
      subscription: null
    }), 7000);


/*------------------------------------
/ シーンの再生
/------------------------------------ */
function playScene(){

  // 入力されたscene内のセリフについて、
  // セリフ間に指定秒のディレイを入れつつ順に再生

  const inputSubj = new Observable(subscriber => {
    // waitMSec待ってから次の後を出力
    const nextword = (waitMSec, input) => {
      return new Promise(resolve => {
        subscriber.next(input);
        setTimeout(() => {
          resolve();
        }, waitMSec);
      }); 
    };

    // 配列を順番にPromiseで処理
    const sequential = function(array) {
      array.reduce((promise, val) => {
        return promise.then(() => {
            if(sceneSubj.getValue().status == 'cenceled'){
              throw new Error();
            }
          }
        ).then(res => 
            nextword(val.length > 1 ? val[1] : defaultWordDelay, {
              str: val.length > 0 ? val[0] : "",
              interval: val.length > 2 ? val[2] : defaultCharacterDelay
            }) 
        )
      }, Promise.resolve())
      .then(() => {
        sceneSubj.next(
          {
            scene: [],
            status: 'completed',
            subscription: null
          });
        }
      )
      .catch(() => {
        console.log('scene has been stopped by cancel command');
        sceneSubj.next(
          {
          scene: [],
          status: 'completed',
          subscription: null
          });
      })
    };
    sequential(sceneSubj.getValue().scene);
  });
 

  // 入力されたセリフについて
  // 文字間に指定秒のディレイを入れつつ一文字ずつ表示

  const chatterObs = inputSubj.pipe(
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
  );

  return chatterObs.subscribe(
    out => (document.body.innerHTML += out)
  );
};


