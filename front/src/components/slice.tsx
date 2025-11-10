// import React, { useEffect, useMemo, useRef, useState } from "react";

// const generateDatas = (): { id: number; name: string; age: number }[] => {
//   return Array.from({ length: 1000000 }, (_, index) => ({
//     id: index,
//     name: `name${index}`,
//     age: index,
//   }));
// };

// // 分批加载数据
// const allDatas = generateDatas;

// const yieldTomain = () => {
//   return new Promise((resolve) => {
//     setTimeout(resolve, 0);
//   });
// };

// /**
//  * useEffect最后执行，在微任务和宏任务之后
//  * 下次重新渲染任务放在"本次"所有宏任务之后
//  */

// export const Slice: React.FC = () => {
//   const [datas, setDatas] = useState<
//     { id: number; name: string; age: number }[]
//   >([]);
//   // 用 useState 保存 i，确保多次渲染间 i 不重置
//   const [i, setI] = useState(0);
//   console.log(i);

//   Promise.resolve().then(() => {
//     console.log(i, "promise1");
//   });
//   useEffect(() => {
//     console.log(i, "useEffect");

//     setI(3);
//     setTimeout(() => {
//       generateDatas();
//       console.log(i, "setTimeout1");
//       setTimeout(() => {
//         generateDatas();
//         console.log(i, "setTimeout3");
//       }, 0);
//     }, 0);
//     setTimeout(() => {
//       generateDatas();
//       console.log(i, "setTimeout2");
//     }, 0);
//   }, [i]);
//   Promise.resolve().then(() => {
//     console.log(i, "promise2");
//   });

//   //   useEffect(() => {
//   //     const render = async () => {
//   //       // 用 setI 获取最新的 i 值（避免闭包陷阱）
//   //       if (i > allDatas.length) return;
//   //       requestIdleCallback((deadline) => {
//   //         if (deadline.timeRemaining() > 0) {
//   //           // 追加数据（而不是覆盖）：datas 取最新值，用函数式更新
//   //           setDatas((prevDatas) => {
//   //             return [...prevDatas, ...allDatas.slice(i, i + 100)];
//   //           });
//   //           setI((prevI) => prevI + 100);
//   //         }
//   //       });
//   //     };

//   //     render();
//   //   }, [i]); // 依赖 i，i 变化时重新执行

//   return (
//     <div>
//       <h1>Slice</h1>
//       <ul>
//         {datas.map((item) => (
//           <li key={item.id}>{item.name}</li>
//         ))}
//       </ul>
//     </div>
//   );
// };

// export default Slice;
