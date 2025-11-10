import React, { Component } from "react";

function debounce(wait: number) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    console.log(target, key);

    const originalMethod = descriptor.value;
    let debounceTimer: any = null;
    descriptor.value = function (...args: any[]) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        originalMethod.apply(this, args);
      }, wait);
    };
    return descriptor;
  };
}

export const Client = <T extends Record<string, any>>(
  parmas: Record<string, any>
) => {
  return (WrappComponent: React.ComponentClass<T>) => {
    class ClientWrapper extends Component<T> {
      state: T & { clientWidth: string; clientHeight: string };
      constructor(props: T) {
        super(props);
        this.state = {
          ...props,
          name: parmas.name,
          clientWidth: "0",
          clientHeight: "0",
        };
      }
      componentDidMount(): void {
        window.addEventListener("resize", this.handleResize.bind(this));
        // 组件挂载后立即调用一次，初始化尺寸
        this.handleResize();
      }
      componentWillUnmount(): void {
        window.removeEventListener("resize", this.handleResize.bind(this));
      }

      @debounce(200)
      handleResize() {
        this.setState({
          clientWidth: window.innerWidth.toString(),
          clientHeight: window.innerHeight.toString(),
        });
      }
      render() {
        return (
          <WrappComponent {...this.props} {...this.state}></WrappComponent>
        );
      }
    }
    return ClientWrapper;
  };
};

@Client<{ name?: string }>({
  name: "ClientComponent",
})
class ClientComponent extends Component<Record<string, any>> {
  render() {
    return (
      <div>
        <h1>ClientComponent ---------- {this.props.name}</h1>
        <h1>clientWidth: {this.props.clientWidth}</h1>
        <h1>clientHeight: {this.props.clientHeight}</h1>
      </div>
    );
  }
}

export default ClientComponent;
